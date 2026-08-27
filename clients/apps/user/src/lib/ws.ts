import { API_BASE_URL } from "../config/api"

/**
 * WebSocket client for /v1/ws. Initial state always comes from REST; the
 * socket applies subsequent changes. Reconnects with backoff and reports
 * reconnection so callers can refetch (version gaps are covered by the same
 * refetch).
 */

export type WsEvent = {
  type: string
  payload?: Record<string, unknown>
  timestamp: string
  version: number
}

type WsOptions = {
  onEvent: (event: WsEvent) => void
  onReconnect?: () => void
}

export function connectWs({ onEvent, onReconnect }: WsOptions) {
  let socket: WebSocket | null = null
  let closedByUs = false
  let attempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let lastVersion = 0

  const open = () => {
    socket = new WebSocket(`${API_BASE_URL.replace(/^http/, "ws")}/v1/ws`)

    socket.onopen = () => {
      const wasReconnect = attempt > 0
      attempt = 0
      if (wasReconnect) {
        onReconnect?.()
      }
    }

    socket.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data as string) as WsEvent
        if (typeof event.version === "number" && event.version > 0) {
          // Detect gaps: server restarted or events were missed.
          if (lastVersion > 0 && event.version > lastVersion + 1) {
            onReconnect?.()
          }
          lastVersion = event.version
        }
        if (event.type === "ping") return
        onEvent(event)
      } catch {
        // Ignore malformed frames.
      }
    }

    socket.onclose = () => {
      if (closedByUs) return
      attempt += 1
      // Exponential backoff capped at 30s.
      const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5))
      reconnectTimer = setTimeout(open, delay)
    }
  }

  // A resumed page (iOS unfreeze) may sit on a dead socket with a long
  // backoff timer still pending — reconnect the moment it becomes visible.
  const onVisible = () => {
    if (closedByUs || document.visibilityState !== "visible") return
    if (socket && socket.readyState === WebSocket.CLOSED) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      attempt = 0
      open()
    }
  }
  document.addEventListener("visibilitychange", onVisible)

  open()

  return () => {
    closedByUs = true
    document.removeEventListener("visibilitychange", onVisible)
    if (reconnectTimer) clearTimeout(reconnectTimer)
    socket?.close()
  }
}
