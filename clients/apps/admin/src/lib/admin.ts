import { useEffect, useState } from "react"
import { api } from "./api"
import { API_BASE_URL } from "../config/api"
import type { Ring } from "./geometry"

/**
 * Admin panel data layer. The panel is internal ops tooling: English-only by
 * design, session-guarded through the same cookie as the customer site.
 */

export type AdminSession = {
  id: number
  phone: string
  name: string
  role: "super_admin" | "operations_admin"
}

export async function fetchAdminSession(): Promise<AdminSession | null> {
  try {
    const res = await api.get<{
      authenticated: boolean
      type?: string
      admin?: AdminSession
    }>("/v1/auth/session")
    if (res.authenticated && res.type === "admin" && res.admin) {
      return res.admin
    }
  } catch {
    // API down: treat as logged out.
  }
  return null
}

export function useAdminSession() {
  const [admin, setAdmin] = useState<AdminSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchAdminSession().then((a) => {
      if (!cancelled) {
        setAdmin(a)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { admin, loading, refresh: () => fetchAdminSession().then(setAdmin) }
}

export type AdminDashboardData = {
  delivery_date: string
  order_count: number
  total_paise: number
  by_status: Record<string, { count: number; total_paise: number }>
  active_runs: number
  run_count: number
  needs_attention: Array<{
    order_id: number
    code: string
    status: string
    customer: string
    total_paise: number
    created_at: string
  }>
}

export type AdminOrderRow = {
  order_id: number
  code: string
  status: string
  delivery_date: string
  total_paise: number
  created_at: string
  customer_name?: string
  customer_phone?: string
  partner_name?: string
  run_id?: number
  stop_position?: number
  stop_status?: string
}

export type BatchRow = {
  batch_id: number
  order_date: string
  delivery_date: string
  cutoff_policy: string
  status: "open" | "closed"
  order_count: number
  cancelled_count: number
  delivered_count: number
  total_paise: number
}

export type BatchDetail = BatchRow & {
  counts: { order_count: number; cancelled_count: number; total_paise: number; delivered_count: number }
  preparation_summary: Array<{
    product_id: number
    name: string
    slug: string
    size_label: string
    unit: string
    total_quantity: number
    order_count: number
  }>
  orders: Array<{ order_id: number; code: string; status: string; delivery_date: string; total_paise: number }>
}

export type RunRow = {
  run_id: number
  delivery_date: string
  name: string
  status: string
  partner_id?: number
  partner_name?: string
  stop_count: number
}

export type StopRow = {
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
  locality: string
  latitude: number
  longitude: number
  collected_paise?: number
  failure_reason?: string
}

export type PartnerRow = { partner_id: number; phone: string; name: string; is_active: boolean }
export type AdminRow = { admin_id: number; phone: string; name: string; role: string; is_active: boolean }
export type LocalityRow = {
  id: number
  name: string
  city: string
  is_active: boolean
  perimeters: Ring[]
}

export type Settings = {
  cutoff_minutes: number
  delivery_window_start: string
  delivery_window_end: string
  business_timezone: string
  tracking_enabled: boolean
  updated_at?: string
}

export type HandoverRow = {
  run_id: number
  delivery_date: string
  partner_name: string
  status: string
  expected_paise: number
  submitted_paise: number
  confirmed_paise: number
  discrepancy_paise: number
  submitted_at?: string
  confirmed_at?: string
}

export type AdminUserDetail = {
  user_id: number
  phone: string
  name?: string
  created_at: string
  address?: {
    label?: string
    address_line: string
    landmark?: string
    locality_name?: string
    locality_city?: string
    latitude?: number
    longitude?: number
  } | null
  address_count: number
  notification?: {
    permission: "granted" | "denied" | "default" | "unsupported"
    reported_at: string
    push_subscribed: boolean
  } | null
}

export const adminApi = {
  dashboard: (deliveryDate?: string) =>
    api.get<AdminDashboardData>(`/v1/admin/dashboard${deliveryDate ? `?delivery_date=${deliveryDate}` : ""}`),
  orders: (query: string) => api.get<{ orders: AdminOrderRow[] }>(`/v1/admin/orders${query}`),
  orderDetail: (id: number) => api.get<Record<string, unknown>>(`/v1/admin/orders/${id}`),
  setOrderStatus: (id: number, status: string, note?: string) =>
    api.patch<{ order_id: number; status: string }>(`/v1/admin/orders/${id}/status`, { status, note }),
  bulkStatus: (orderIds: number[], status: string, note?: string) =>
    api.post<{ updated: number[]; skipped: Array<{ order_id: number; reason: string }> }>(
      "/v1/admin/orders/bulk-status",
      { order_ids: orderIds, status, note },
    ),
  batches: () => api.get<{ batches: BatchRow[] }>("/v1/admin/batches"),
  batch: (id: number) => api.get<BatchDetail>(`/v1/admin/batches/${id}`),
  closeBatch: (id: number) => api.post(`/v1/admin/batches/${id}/close`),
  batchLabelsUrl: (id: number) => `${API_BASE_URL}/v1/admin/batches/${id}/labels`,
  runs: (query = "") => api.get<{ runs: RunRow[] }>(`/v1/admin/delivery-runs${query}`),
  run: (id: number) =>
    api.get<RunRow & { stops: StopRow[]; cash?: { collected_paise: number; pending_paise: number; failed_paise: number } }>(
      `/v1/admin/delivery-runs/${id}`,
    ),
  createRun: (body: { batch_id: number; partner_id?: number; order_ids?: number[]; locality_id?: number; name?: string }) =>
    api.post<{ run_id: number; stops: number }>("/v1/admin/delivery-runs", body),
  updateRun: (id: number, body: { name?: string; partner_id?: number; status?: string }) =>
    api.patch(`/v1/admin/delivery-runs/${id}`, body),
  addStop: (runId: number, orderId: number) =>
    api.post(`/v1/admin/delivery-runs/${runId}/stops`, { order_id: orderId }),
  removeStop: (runId: number, stopId: number) =>
    api.del(`/v1/admin/delivery-runs/${runId}/stops/${stopId}`),
  reorderStops: (runId: number, stopIds: number[]) =>
    api.patch(`/v1/admin/delivery-runs/${runId}/stops/reorder`, { stop_ids: stopIds }),
  dispatchRun: (runId: number) => api.post(`/v1/admin/delivery-runs/${runId}/dispatch`),
  runTracking: (runId: number) => api.get<Record<string, unknown>>(`/v1/admin/delivery-runs/${runId}/tracking`),
  activeRuns: () => api.get<{ runs: Array<Record<string, unknown>> }>("/v1/admin/delivery-runs/active"),
  cashSummary: (runId: number) => api.get<Record<string, unknown>>(`/v1/admin/delivery-runs/${runId}/cash-summary`),
  confirmHandover: (runId: number, confirmedPaise: number) =>
    api.post(`/v1/admin/delivery-runs/${runId}/reconciliation/confirm`, { confirmed_paise: confirmedPaise }),
  handovers: () => api.get<{ handovers: HandoverRow[] }>("/v1/admin/cash/handovers"),
  partners: () => api.get<{ partners: PartnerRow[] }>("/v1/admin/delivery-partners"),
  createPartner: (body: { phone: string; name: string }) =>
    api.post<PartnerRow>("/v1/admin/delivery-partners", body),
  updatePartner: (id: number, body: { name?: string; phone?: string; is_active?: boolean }) =>
    api.patch<PartnerRow>(`/v1/admin/delivery-partners/${id}`, body),
  admins: () => api.get<{ admins: AdminRow[] }>("/v1/admin/admins"),
  createAdmin: (body: { phone: string; name: string; role: string }) =>
    api.post<AdminRow>("/v1/admin/admins", body),
  updateAdmin: (id: number, body: { name?: string; role?: string; is_active?: boolean }) =>
    api.patch<AdminRow>(`/v1/admin/admins/${id}`, body),
  localities: () => api.get<{ localities: LocalityRow[] }>("/v1/admin/localities"),
  createLocality: (body: { name: string; city?: string; perimeters?: Ring[] }) =>
    api.post<LocalityRow>("/v1/admin/localities", body),
  updateLocality: (
    id: number,
    body: { name?: string; city?: string; is_active: boolean; perimeters?: Ring[] },
  ) => api.put<LocalityRow>(`/v1/admin/localities/${id}`, body),
  products: () => api.get<{ products: Array<Record<string, unknown>> }>("/v1/admin/products"),
  createProduct: (body: Record<string, unknown>) =>
    api.post<Record<string, unknown>>("/v1/admin/products", body),
  updateProduct: (id: number, body: Record<string, unknown>) =>
    api.put<Record<string, unknown>>(`/v1/admin/products/${id}`, body),
  archiveProduct: (id: number) => api.del(`/v1/admin/products/${id}`),
  permanentDeleteProduct: (id: number) => api.del(`/v1/admin/products/${id}/permanent`),
  settings: () => api.get<Settings>("/v1/admin/settings"),
  updateSettings: (body: Partial<Settings>) => api.patch<Settings>("/v1/admin/settings", body),

  users: () =>
    api.get<{ users: Array<Record<string, unknown>> }>("/v1/admin/users"),
  userDetail: (userId: number) =>
    api.get<{ user: AdminUserDetail }>(`/v1/admin/users/${userId}`),
  chatThread: (userId: number) =>
    api.get<Record<string, unknown>>(`/v1/admin/chat/threads/${userId}`),
}

export const NEXT_STATUS: Record<string, { label: string; to: string }[]> = {
  placed: [{ label: "Confirm", to: "confirmed" }],
  confirmed: [{ label: "Start preparing", to: "preparing" }],
  preparing: [{ label: "Mark ready", to: "ready" }],
  ready: [],
  assigned: [{ label: "Cancel", to: "cancelled" }],
  picked_up: [],
  out_for_delivery: [],
  delivered: [],
  cancelled: [],
  delivery_failed: [],
}
