import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "./api"
import { useAuth } from "./auth"
import { connectWs } from "./ws"

/**
 * Unread support-message count for the logged-in customer. Server-backed so
 * the red dot survives reloads and only clears when /v1/chat/me marks the
 * thread read (i.e. the customer opens the chat).
 *
 * The hook opens its own WebSocket while mounted so new admin replies light
 * the dot in realtime from any page; the hub fans out to every connection,
 * so this coexists with the /support page's socket.
 */

export const chatUnreadKey = ["chat-unread"] as const

export function useChatUnread() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: chatUnreadKey,
    queryFn: () => api.get<{ unread: number }>("/v1/chat/unread"),
    enabled: !!user,
  })

  useEffect(() => {
    if (!user) return
    const close = connectWs({
      onEvent: (event) => {
        if (event.type !== "chat.message_new") return
        const payload = event.payload as { sender_role?: string } | undefined
        if (payload?.sender_role === "admin") {
          queryClient.invalidateQueries({ queryKey: chatUnreadKey })
        }
      },
      onReconnect: () => queryClient.invalidateQueries({ queryKey: chatUnreadKey }),
    })
    return close
  }, [user, queryClient])

  return data?.unread ?? 0
}
