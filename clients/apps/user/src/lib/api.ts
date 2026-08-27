import { API_BASE_URL } from "../config/api"

/**
 * Typed client for the /v1 platform API. Browser sessions ride the HTTP-only
 * `session_id` cookie; every call sends credentials so cross-origin requests
 * (aarogyaruchi.com → api.aarogyaruchi.com) stay authenticated.
 */

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: string }
    return new ApiError(res.status, body.error ?? res.statusText)
  } catch {
    return new ApiError(res.status, res.statusText)
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  if (init.idempotencyKey) {
    headers.set("Idempotency-Key", init.idempotencyKey)
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  })
  if (!res.ok) {
    throw await parseError(res)
  }
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, opts?: { idempotencyKey?: string }) =>
    request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      idempotencyKey: opts?.idempotencyKey,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
}

// ---- Shared domain types (mirror the Go handlers) ----

/** One sellable size of a product (what orders reference). */
export type Variant = {
  id: number
  slug: string
  size_label?: string
  unit?: string
  price_paise: number
  is_default: boolean
}

/** Catalog product with its variants — the storefront shape. */
export type Product = {
  id: number
  slug: string
  name: string
  description?: string
  category?: string
  image_url?: string
  ingredients: string[]
  nutrition?: Record<string, string>
  tags: string[]
  is_featured: boolean
  variants: Variant[]
}

export type Locality = {
  id: number
  name: string
  city: string
  is_active: boolean
}

export type ProfileLocation = {
  latitude: number
  longitude: number
  accuracy_m?: number
}

export type Address = {
  id: number
  label?: string
  address_line: string
  landmark?: string
  locality_id?: number
  latitude?: number
  longitude?: number
  accuracy_m?: number
  instructions?: string
  is_default: boolean
}

export type OrderSummary = {
  order_id: number
  code: string
  status: OrderStatus
  delivery_date: string
  total_paise: number
  created_at: string
}

export type OrderStatus =
  | "placed"
  | "confirmed"
  | "preparing"
  | "ready"
  | "assigned"
  | "picked_up"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "delivery_failed"

export type OrderItemView = {
  variant_id: number
  name: string
  size_label?: string
  quantity: number
  unit_price_paise: number
  total_price_paise: number
}

export type OrderTimelineEntry = {
  status: string
  from?: string
  actor_type: string
  note?: string
  at: string
}

export type Tracking = {
  latitude: number
  longitude: number
  accuracy_m?: number
  recorded_at: string
  age_seconds: number
  is_live: boolean
}

export type OrderDetail = OrderSummary & {
  payment_method: string
  items: OrderItemView[]
  timeline: OrderTimelineEntry[]
  address: { address_line: string; landmark?: string; instructions?: string }
  partner?: { name: string }
  tracking?: Tracking
}

export type Quote = {
  items: Array<{
    variant_id: number
    name: string
    size_label?: string
    quantity: number
    unit_price_paise: number
    total_price_paise: number
  }>
  total_paise: number
  delivery_date: string
  batch_status: string
}

/** Format integer paise as ₹rupees (e.g. 17000 → "₹170", 15550 → "₹155.50"). */
export function formatPaise(paise: number): string {
  const rupees = Math.floor(paise / 100)
  const rest = paise % 100
  if (rest === 0) return `₹${rupees}`
  return `₹${rupees}.${String(rest).padStart(2, "0")}`
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100)
}
