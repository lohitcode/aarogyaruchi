import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { MessageCircle, RotateCcw, Send, Trash2, X } from "lucide-react";
import { Button } from "@aarogyaruchi/ui/components/button";
import { Input } from "@aarogyaruchi/ui/components/input";
import { CHAT_STREAM_URL } from "../../config/api";
import { readChatSseStream, type ChatErrorKind } from "../../lib/chat-sse";
import { chatStorage, type ChatHistoryMessage } from "../../lib/chat-storage";
import { useI18n, useMessages } from "../../i18n";

type BubbleStatus = "streaming" | "done" | "error";

type Bubble = ChatHistoryMessage & {
  status: BubbleStatus;
  errorKind?: "offline" | ChatErrorKind;
};

/** Context sent to the API: last 12 messages, each capped at 1,000 chars. */
const CONTEXT_MESSAGE_LIMIT = 12;
const MESSAGE_CHAR_LIMIT = 1000;

/** Wire format for POST /chat/stream — the API reads `content`, not `text`. */
type ChatWireMessage = {
  role: ChatHistoryMessage["role"];
  content: string;
};

const INPUT_ID = "chat-message-input";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toContext(bubbles: Bubble[]): ChatWireMessage[] {
  return bubbles
    .filter((b) => b.status === "done" && b.text.trim().length > 0)
    .slice(-CONTEXT_MESSAGE_LIMIT)
    .map((b) => ({
      role: b.role,
      content: b.text.slice(0, MESSAGE_CHAR_LIMIT),
    }));
}

export function ChatWidget() {
  const { locale } = useI18n();
  const t = useMessages();
  const reducedMotion = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [fallbackNotice, setFallbackNotice] = useState(false);
  const [inlineError, setInlineError] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Restore the browser-local conversation once after mount.
  useEffect(() => {
    const stored = chatStorage.getHistory();
    setBubbles(
      stored.map((m) => ({
        ...m,
        status: "done" as BubbleStatus,
      }))
    );
    setHistoryLoaded(true);
  }, []);

  // Keep the newest message visible while streaming.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
    // bubbles/open are re-run triggers, not reads: scroll again whenever a
    // message arrives or the panel opens.
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger dependencies
  }, [bubbles, open]);

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    inputRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Full-screen chat locks the page behind it while open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const persist = useCallback((current: Bubble[]) => {
    chatStorage.saveHistory(
      current
        .filter((b) => b.status === "done")
        .map(({ id, role, text, productSlugs }) => ({
          id,
          role,
          text,
          productSlugs,
        }))
    );
  }, []);

  const errorText = useCallback(
    (kind: "offline" | ChatErrorKind) => {
      switch (kind) {
        case "offline":
          return t.chat.offline;
        case "rate_limited":
          return t.chat.rateLimited;
        default:
          return t.chat.providerError;
      }
    },
    [t]
  );

  const runStream = useCallback(
    async (context: ChatWireMessage[]) => {
      const assistantId = newId();
      setBubbles((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", text: "", status: "streaming" },
      ]);
      setStreaming(true);
      setFallbackNotice(false);

      const controller = new AbortController();
      abortRef.current = controller;

      const finalize = (patch: Partial<Bubble>) => {
        setBubbles((prev) => {
          const next = prev.map((b) =>
            b.id === assistantId ? { ...b, ...patch } : b
          );
          persist(next);
          return next;
        });
        setStreaming(false);
      };

      try {
        const response = await fetch(CHAT_STREAM_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ locale, messages: context }),
        });

        if (!response.body) {
          finalize({ status: "error", errorKind: "provider_error" });
          return;
        }

        await readChatSseStream(response.body, (event) => {
          switch (event.type) {
            case "delta":
              setBubbles((prev) =>
                prev.map((b) =>
                  b.id === assistantId ? { ...b, text: b.text + event.text } : b
                )
              );
              break;
            case "fallback":
              setFallbackNotice(true);
              break;
            case "done":
              finalize({ status: "done", productSlugs: event.products });
              abortRef.current = null;
              break;
            case "error":
              finalize({
                status: "error",
                errorKind: event.kind,
                text: "",
              });
              abortRef.current = null;
              break;
          }
        });

        // Stream ended without a terminal event (e.g. connection dropped).
        setBubbles((prev) => {
          const stillStreaming = prev.find((b) => b.id === assistantId);
          if (stillStreaming?.status === "streaming") {
            const next = prev.map((b) =>
              b.id === assistantId
                ? b.text.trim()
                  ? { ...b, status: "done" as BubbleStatus }
                  : {
                      ...b,
                      status: "error" as BubbleStatus,
                      errorKind: "provider_error" as const,
                    }
                : b
            );
            persist(next);
            return next;
          }
          return prev;
        });
        setStreaming(false);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setStreaming(false);
          return;
        }
        finalize({ status: "error", errorKind: "offline", text: "" });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [locale, persist]
  );

  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || streaming) {
        return;
      }

      if (text.length > MESSAGE_CHAR_LIMIT) {
        setInlineError(t.chat.inputTooLong);
        return;
      }
      setInlineError("");

      const userBubble: Bubble = {
        id: newId(),
        role: "user",
        text,
        status: "done",
      };

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setBubbles((prev) => [
          ...prev,
          userBubble,
          {
            id: newId(),
            role: "assistant",
            text: "",
            status: "error",
            errorKind: "offline",
          },
        ]);
        return;
      }

      const context: ChatWireMessage[] = [
        ...toContext(bubbles),
        { role: "user" as const, content: text },
      ];
      setBubbles((prev) => [...prev, userBubble]);
      setInput("");
      await runStream(context);
    },
    [bubbles, runStream, streaming, t.chat.inputTooLong]
  );

  const retryLast = useCallback(async () => {
    if (streaming) {
      return;
    }
    // Drop trailing error bubbles, then resend the last user message.
    let lastUserText = "";
    const kept: Bubble[] = [];
    for (const bubble of bubbles) {
      if (bubble.status === "error") {
        continue;
      }
      if (bubble.role === "user") {
        lastUserText = bubble.text;
      }
      kept.push(bubble);
    }
    setBubbles(kept);
    if (lastUserText) {
      await runStream(toContext(kept));
    }
  }, [bubbles, runStream, streaming]);

  const clearConversation = useCallback(() => {
    abortRef.current?.abort();
    chatStorage.clear();
    setBubbles([]);
    setFallbackNotice(false);
    setInlineError("");
    inputRef.current?.focus();
  }, []);

  const productName = useCallback(
    (slug: string) => t.catalog.products[slug]?.name ?? slug,
    [t]
  );

  const hasErrorBubble = bubbles.some((b) => b.status === "error");
  const showWelcome = historyLoaded && bubbles.length === 0;

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t.chat.launcher}
        aria-expanded={open}
        className="fixed bottom-4 right-4 z-50 flex h-13 w-13 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:bottom-6 md:right-6"
      >
        {open ? (
          <X className="h-6 w-6" aria-hidden />
        ) : (
          <MessageCircle className="h-6 w-6" aria-hidden />
        )}
      </button>

      {/* Full-screen chat panel */}
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={t.chat.title}
          initial={reducedMotion ? false : { y: "100%" }}
          animate={{ y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-50 flex flex-col bg-background"
        >
          <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 border-b border-black/10 bg-primary px-4 py-3 text-primary-foreground">
              <div>
                <p className="text-sm font-semibold leading-tight">
                  {t.chat.title}
                </p>
                <p className="mt-0.5 text-xs text-primary-foreground/80">
                  {t.chat.subtitle}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={clearConversation}
                  aria-label={t.chat.clear}
                  className="rounded-sm p-1.5 transition-colors hover:bg-primary-foreground/15"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t.chat.close}
                  className="rounded-sm p-1.5 transition-colors hover:bg-primary-foreground/15"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={listRef}
              role="log"
              aria-live="polite"
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            >
              {showWelcome && (
                <div className="max-w-[85%] self-start rounded-sm rounded-tl-none bg-secondary px-3 py-2 text-sm leading-relaxed text-foreground">
                  {t.chat.welcome}
                </div>
              )}

              {bubbles.map((bubble) =>
                bubble.status === "error" ? (
                  <div
                    key={bubble.id}
                    className="flex flex-col items-start gap-1"
                  >
                    <div className="max-w-[85%] rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      {errorText(bubble.errorKind ?? "provider_error")}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={retryLast}
                      disabled={streaming}
                      className="h-7 rounded-sm border-black/15 px-2 text-xs text-foreground"
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      {t.chat.retry}
                    </Button>
                  </div>
                ) : (
                  <div
                    key={bubble.id}
                    className={`flex flex-col ${bubble.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-sm px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                        bubble.role === "user"
                          ? "rounded-tr-none bg-primary text-primary-foreground"
                          : "rounded-tl-none bg-secondary text-foreground"
                      }`}
                    >
                      {bubble.text}
                      {bubble.status === "streaming" && (
                        <span
                          className="ml-1 inline-block h-3.5 w-1.5 animate-pulse bg-foreground/40 align-middle"
                          aria-hidden
                        />
                      )}
                    </div>
                    {bubble.status === "done" &&
                      bubble.productSlugs &&
                      bubble.productSlugs.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {bubble.productSlugs.map((slug) => (
                            <Link
                              key={slug}
                              to="/products/$slug"
                              params={{ slug }}
                              onClick={() => setOpen(false)}
                              className="rounded-sm border border-primary/40 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                            >
                              {productName(slug)}
                            </Link>
                          ))}
                        </div>
                      )}
                  </div>
                )
              )}

              {fallbackNotice && (
                <p className="text-xs text-muted-foreground">
                  {t.chat.fallbackNotice}
                </p>
              )}
            </div>

            {/* Input */}
            <form
              className="border-t border-black/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
            >
              {inlineError && (
                <p className="mb-2 text-xs text-destructive">{inlineError}</p>
              )}
              <div className="flex items-center gap-2">
                <Input
                  id={INPUT_ID}
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t.chat.placeholder}
                  aria-label={t.chat.placeholder}
                  disabled={streaming}
                  maxLength={MESSAGE_CHAR_LIMIT + 100}
                  className="rounded-sm border border-black/15 px-3 py-2.5 text-sm focus-visible:ring-0"
                />
                <Button
                  type="submit"
                  disabled={streaming || input.trim().length === 0}
                  aria-label={t.chat.send}
                  className="rounded-sm bg-primary px-3 py-2.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                {t.chat.disclaimer}
              </p>
            </form>
          </div>
        </motion.div>
      )}

      {/* Screen-reader announcements for stream errors. */}
      <span className="sr-only" aria-live="polite">
        {hasErrorBubble ? errorText("provider_error") : ""}
      </span>
    </>
  );
}
