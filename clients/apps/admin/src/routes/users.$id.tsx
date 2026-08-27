import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, Phone, Send } from "lucide-react"
import { api } from "../lib/api"
import { adminApi } from "../lib/admin"
import { connectWs } from "../lib/ws"

export const Route = createFileRoute("/users/$id")({
  component: AdminUserChat,
})

type ChatMessage = {
  id: number
  sender_role: "user" | "admin"
  body: string
  created_at: string
}

type ThreadData = {
  thread_id: number
  user_id: number
  user_phone: string
  user_name?: string
  messages: ChatMessage[]
}

function AdminUserChat() {
  const { id } = Route.useParams()
  const userID = Number(id)
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, error: loadError, refetch: retry } = useQuery({
    queryKey: ["admin-chat", userID],
    queryFn: () => adminApi.chatThread(userID),
    retry: 1,
  })

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["admin-chat", userID] })
    queryClient.invalidateQueries({ queryKey: ["admin-users"] })
  }, [queryClient, userID])

  useEffect(() => {
    const close = connectWs({
      onEvent: (event) => {
        const payload = event.payload as { thread_id?: number } | undefined
        if (event.type === "chat.message_new" && (!payload?.thread_id || payload.thread_id === data?.thread_id)) {
          refetch()
        }
      },
      onReconnect: refetch,
    })
    return close
  }, [refetch, data?.thread_id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [data ? (data.messages as ChatMessage[] | undefined)?.length : undefined])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setError("")
    try {
      await api.post(`/v1/admin/chat/threads/${userID}/messages`, { body })
      setDraft("")
      refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send")
    } finally {
      setSending(false)
    }
  }

  if (isLoading) {
    return <p className="text-sm text-neutral-500">Loading…</p>
  }
  if (!data || loadError) {
    return (
      <div className="text-sm text-neutral-500">
        <p className="text-red-600">{loadError instanceof Error ? loadError.message : "Couldn't load this conversation."}</p>
        <button type="button" onClick={() => retry()} className="mt-2 border border-neutral-300 px-3 py-1.5 hover:border-neutral-500">
          Try again
        </button>
      </div>
    )
  }

  const thread = data as ThreadData

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/users" className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
          <ArrowLeft className="h-4 w-4" />
          All customers
        </Link>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold text-neutral-900">{thread.user_phone}</p>
          <p className="text-xs text-neutral-500">{thread.user_name || "Customer"}</p>
        </div>
      </div>

      <div className="mt-4 flex min-h-96 flex-1 flex-col overflow-y-auto border border-neutral-200 bg-white p-4">
        {thread.messages.length === 0 ? (
          <p className="my-auto text-center text-sm text-neutral-400">
            No messages yet — say hello below to start the conversation.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {thread.messages.map((m) => (
              <li key={m.id} className={`flex flex-col ${m.sender_role === "admin" ? "items-end" : "items-start"}`}>
                <span className="mb-1 text-[11px] text-neutral-400">
                  {m.sender_role === "admin" ? "You (Support)" : thread.user_phone} ·{" "}
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span
                  className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.sender_role === "admin"
                      ? "bg-neutral-900 text-white"
                      : "border border-neutral-200 bg-neutral-50 text-neutral-900"
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

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Reply as Support…"
          aria-label="Reply message"
          maxLength={2000}
          className="flex-1 border border-neutral-300 px-3.5 py-3 text-sm outline-none focus:border-neutral-500"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="bg-neutral-900 px-5 text-white disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          <span className="sr-only">Send</span>
        </button>
      </form>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-neutral-400">
        <Phone className="h-3 w-3" />
        The customer sees these replies from “Aarogya Ruchi Support”
      </p>
    </div>
  )
}
