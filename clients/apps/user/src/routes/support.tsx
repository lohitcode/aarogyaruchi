import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Send } from "lucide-react";
import { Button } from "@aarogyaruchi/ui/components/button";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { chatUnreadKey } from "../lib/chat";
import { connectWs } from "../lib/ws";
import {
  currentPermission,
  enablePush,
  pushSupported,
  subscribeQuietly,
} from "../lib/push";
import { useMessages, usePageMetadata } from "../i18n";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — Aarogya Ruchi" },
      {
        name: "description",
        content:
          "Chat with the Aarogya Ruchi team about your orders and deliveries.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SupportPage,
});

type ChatMessage = {
  id: number;
  thread_id: number;
  sender_role: "user" | "admin";
  body: string;
  created_at: string;
};

function SupportPage() {
  const { user } = useAuth();
  const t = useMessages();
  const queryClient = useQueryClient();
  usePageMetadata({
    title: t.support.title,
    description: t.support.description,
  });

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [pushState, setPushState] = useState<
    "subscribing" | "granted" | "denied" | "default" | "unsupported"
  >(currentPermission() === "granted" ? "subscribing" : currentPermission());
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api
      .get<{ thread_id: number; messages: ChatMessage[] }>("/v1/chat/me")
      .then((res) => {
        setMessages(res.messages);
        // The request above marks the thread read — refresh the nav dot.
        queryClient.invalidateQueries({ queryKey: chatUnreadKey });
      })
      .catch(() => setError(t.support.loadFailed));
  }, [t, queryClient]);

  useEffect(() => {
    if (!user) return;
    load();
    // Live updates over WS; refetch on reconnect and on version gaps.
    const close = connectWs({
      onEvent: (event) => {
        if (event.type === "chat.message_new") load();
      },
      onReconnect: load,
    });
    // Permission already granted from a previous session → keep the device
    // subscribed (browsers can drop subscriptions).
    subscribeQuietly().then((ok) => setPushState(ok ? "granted" : "default"));
    return close;
  }, [user, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const msg = await api.post<ChatMessage>("/v1/chat/me/messages", { body });
      setDraft("");
      setMessages((prev) => [...(prev ?? []), msg]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.support.sendFailed);
    } finally {
      setSending(false);
    }
  };

  const turnOnPush = async () => {
    const state = await enablePush();
    setPushState(state);
  };

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-20 text-center md:px-10">
        <p className="text-muted-foreground">{t.support.loginFirst}</p>
        <Button
          onClick={() => window.location.reload()}
          className="mt-6 rounded-sm bg-primary px-6 py-3 text-primary-foreground"
        >
          {t.support.loginButton}
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-foreground">{t.support.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.support.youAre}{" "}
            <span className="font-medium text-foreground">{user.phone}</span>
          </p>
        </div>
        {pushSupported() && pushState === "default" && (
          <button
            type="button"
            onClick={turnOnPush}
            className="flex items-center gap-2 border border-black/15 px-3 py-2 text-sm text-foreground hover:bg-secondary"
          >
            <Bell className="h-4 w-4" />
            {t.support.enableNotifications}
          </button>
        )}
        {pushState === "granted" && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Bell className="h-3.5 w-3.5 text-primary" />
            {t.support.notificationsOn}
          </span>
        )}
        {pushState === "denied" && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BellOff className="h-3.5 w-3.5" />
            {t.support.notificationsBlocked}
          </span>
        )}
      </div>

      <div className="mt-6 flex min-h-80 flex-1 flex-col overflow-y-auto border border-black/10 bg-secondary/30 p-4">
        {messages === null ? (
          <p className="text-sm text-muted-foreground">{t.shop.loading}</p>
        ) : messages.length === 0 ? (
          <p className="my-auto text-center text-sm text-muted-foreground">
            {t.support.emptyThread}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className={`flex flex-col ${m.sender_role === "user" ? "items-end" : "items-start"}`}
              >
                <span className="mb-1 text-[11px] text-muted-foreground">
                  {m.sender_role === "user"
                    ? t.support.youLabel
                    : t.support.supportLabel}{" "}
                  ·{" "}
                  {new Date(m.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span
                  className={`max-w-[85%] rounded-sm px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.sender_role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-black/10 bg-background text-foreground"
                  }`}
                >
                  {m.body}
                </span>
              </li>
            ))}
            <div ref={bottomRef} />
          </ul>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.support.messagePlaceholder}
          aria-label={t.support.messagePlaceholder}
          maxLength={2000}
          className="flex-1 border border-black/15 bg-background px-3.5 py-3 text-sm outline-none focus:border-primary"
        />
        <Button
          type="submit"
          disabled={!draft.trim() || sending}
          className="rounded-sm bg-primary px-5 text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          <span className="sr-only">{t.support.send}</span>
        </Button>
      </form>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {t.support.replyTime} ·{" "}
        <Link to="/orders" className="underline">
          {t.shop.viewOrders}
        </Link>
      </p>
    </main>
  );
}
