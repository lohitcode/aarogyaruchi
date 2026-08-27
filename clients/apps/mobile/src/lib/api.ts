import * as SecureStore from "expo-secure-store"
import { API_BASE_URL } from "./config"

/**
 * Token-authenticated API client for the delivery-partner app. The access
 * token is short-lived; on expiry the client rotates the refresh token once
 * and replays the request.
 */

const ACCESS_KEY = "ar_partner_access"
const REFRESH_KEY = "ar_partner_refresh"

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type Tokens = { access: string; refresh: string }

export async function getTokens(): Promise<Tokens | null> {
  const access = await SecureStore.getItemAsync(ACCESS_KEY)
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY)
  if (!access || !refresh) return null
  return { access, refresh }
}

export async function saveTokens(tokens: Tokens) {
  await SecureStore.setItemAsync(ACCESS_KEY, tokens.access)
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh)
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_KEY)
  await SecureStore.deleteItemAsync(REFRESH_KEY)
}

let refreshing: Promise<boolean> | null = null

/** Rotate the refresh token; returns true when new tokens were stored. */
async function rotateRefresh(): Promise<boolean> {
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY)
  if (!refresh) return false
  try {
    const res = await fetch(`${API_BASE_URL}/v1/auth/partner/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (!res.ok) return false
    const body = (await res.json()) as { access_token: string; refresh_token: string }
    await saveTokens({ access: body.access_token, refresh: body.refresh_token })
    return true
  } catch {
    return false
  }
}

type RequestOptions = {
  method?: string
  body?: unknown
  auth?: boolean
  retry?: boolean
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (opts.auth !== false) {
    const access = await SecureStore.getItemAsync(ACCESS_KEY)
    if (access) headers.Authorization = `Bearer ${access}`
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })

  if (res.status === 401 && opts.auth !== false && opts.retry !== false) {
    if (!refreshing) {
      refreshing = rotateRefresh().finally(() => {
        refreshing = null
      })
    }
    const ok = await refreshing
    if (ok) {
      return request<T>(path, { ...opts, retry: false })
    }
    await clearTokens()
    throw new ApiError(401, "session expired")
  }

  if (!res.ok) {
    let message = res.statusText
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // Non-JSON error body.
    }
    throw new ApiError(res.status, message)
  }

  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: "POST", body, auth }),
}

// ---- Domain types ----

export type Partner = { partner_id: number; name: string; phone: string }

export type RunSummary = {
  run_id: number
  delivery_date: string
  name: string
  status: string
  stop_count: number
}

export type Stop = {
  stop_id: number
  position: number
  status: string
  order_id: number
  order_code: string
  order_status: string
  total_paise: number
  customer_name: string
  customer_phone: string
  address_line: string
  landmark: string
  instructions: string
  locality: string
  latitude: number
  longitude: number
  collected_paise?: number
  failure_reason?: string
  note?: string
  items: Array<{ product_id: number; name: string; size_label?: string; quantity: number }>
}

export type RunDetail = RunSummary & {
  stops: Stop[]
  cash: { collected_paise: number; pending_paise: number; failed_paise: number }
}

export const rupees = (paise: number) => {
  const r = Math.floor(paise / 100)
  const rest = paise % 100
  return rest === 0 ? `₹${r}` : `₹${r}.${String(rest).padStart(2, "0")}`
}
