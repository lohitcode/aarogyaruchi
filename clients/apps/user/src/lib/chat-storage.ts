/** Messages kept in this browser only — chat is anonymous and guest-accessible. */
export type ChatHistoryMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  /** Populated once the server finishes a grounded reply. */
  productSlugs?: string[]
}

const HISTORY_KEY = "aarogya_ruchi_chat"
/** Spec: retain up to 20 recent messages locally in the browser. */
const HISTORY_LIMIT = 20

function isValidMessage(value: unknown): value is ChatHistoryMessage {
  if (typeof value !== "object" || value === null) return false
  const msg = value as Record<string, unknown>
  return (
    typeof msg.id === "string" &&
    (msg.role === "user" || msg.role === "assistant") &&
    typeof msg.text === "string"
  )
}

export const chatStorage = {
  getHistory(): ChatHistoryMessage[] {
    if (typeof window === "undefined") return []
    try {
      const data = localStorage.getItem(HISTORY_KEY)
      if (!data) return []
      const parsed: unknown = JSON.parse(data)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isValidMessage)
    } catch {
      return []
    }
  },

  saveHistory(messages: ChatHistoryMessage[]): void {
    if (typeof window === "undefined") return
    const trimmed = messages.slice(-HISTORY_LIMIT)
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed))
    } catch {
      // Private-mode storage; the conversation simply won't persist.
    }
  },

  clear(): void {
    if (typeof window === "undefined") return
    try {
      localStorage.removeItem(HISTORY_KEY)
    } catch {
      // Ignore — nothing persisted.
    }
  },
}
