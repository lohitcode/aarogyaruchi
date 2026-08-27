const DEFAULT_LOCAL_API = "http://localhost:8080"
const DEFAULT_PRODUCTION_API = "https://api.aarogyaruchi.com"

/**
 * Base URL of the Go API that powers the assistant. The production website
 * talks to the API subdomain; local development falls back to the Go server's
 * default port.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? DEFAULT_LOCAL_API : DEFAULT_PRODUCTION_API)

export const CHAT_STREAM_URL = `${API_BASE_URL}/chat/stream`
