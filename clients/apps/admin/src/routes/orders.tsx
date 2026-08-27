import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { adminApi, NEXT_STATUS, type AdminOrderRow } from "../lib/admin"
import { formatPaise } from "../lib/api"

export const Route = createFileRoute("/orders")({
  component: AdminOrders,
})

const STATUS_LABEL: Record<string, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  assigned: "Assigned",
  picked_up: "Picked up",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  delivery_failed: "Failed",
}

function AdminOrders() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState("")
  const [search, setSearch] = useState("")
  const [date, setDate] = useState("")
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [message, setMessage] = useState("")

  const params = new URLSearchParams()
  if (status) params.set("status", status)
  if (search) params.set("search", search)
  if (date) params.set("delivery_date", date)

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders", status, search, date],
    queryFn: () => adminApi.orders(params.toString() ? `?${params}` : ""),
  })

  const transition = useMutation({
    mutationFn: ({ id, to }: { id: number; to: string }) => adminApi.setOrderStatus(id, to),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-orders"] }),
    onError: (err) => setMessage(err.message),
  })

  const bulk = useMutation({
    mutationFn: ({ ids, to }: { ids: number[]; to: string }) => adminApi.bulkStatus(ids, to),
    onSuccess: (res) => {
      setSelected(new Set())
      setMessage(`${res.updated.length} updated, ${res.skipped.length} skipped.`)
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
    },
    onError: (err) => setMessage(err.message),
  })

  const orders = data?.orders ?? []
  const allSelected = orders.length > 0 && orders.every((o) => selected.has(o.order_id))

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Orders</h1>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name / phone / code"
          aria-label="Search orders"
          className="w-full border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500 sm:w-56"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
          className="border border-neutral-300 px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {Object.keys(STATUS_LABEL).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Filter by delivery date"
          className="border border-neutral-300 px-2 py-1.5 text-sm"
        />
        {(search || status || date) && (
          <button
            type="button"
            onClick={() => {
              setSearch("")
              setStatus("")
              setDate("")
            }}
            className="text-sm text-neutral-500 hover:text-neutral-900"
          >
            Clear
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm sm:gap-3">
          <span className="font-medium text-neutral-700">{selected.size} selected</span>
          <button
            type="button"
            onClick={() => bulk.mutate({ ids: [...selected], to: "confirmed" })}
            className="border border-neutral-400 bg-white px-2.5 py-1 hover:bg-neutral-50"
            disabled={bulk.isPending}
          >
            Confirm all
          </button>
          <button
            type="button"
            onClick={() => bulk.mutate({ ids: [...selected], to: "preparing" })}
            className="border border-neutral-400 bg-white px-2.5 py-1 hover:bg-neutral-50"
            disabled={bulk.isPending}
          >
            Mark preparing
          </button>
          <button
            type="button"
            onClick={() => bulk.mutate({ ids: [...selected], to: "ready" })}
            className="border border-neutral-400 bg-white px-2.5 py-1 hover:bg-neutral-50"
            disabled={bulk.isPending}
          >
            Mark ready
          </button>
        </div>
      )}

      {message && <p className="mt-2 text-sm text-neutral-600">{message}</p>}

      <div className="mt-4 border border-neutral-200 bg-white">
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-neutral-500">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-500">No orders match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs tracking-wide text-neutral-500 uppercase">
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(orders.map((o) => o.order_id)) : new Set())
                      }
                      aria-label="Select all orders"
                    />
                  </th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Delivery</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Run</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <OrderRow
                    key={o.order_id}
                    order={o}
                    selected={selected.has(o.order_id)}
                    onToggle={() => toggle(o.order_id)}
                    onTransition={(to) => transition.mutate({ id: o.order_id, to })}
                    busy={transition.isPending && transition.variables?.id === o.order_id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function OrderRow({
  order,
  selected,
  onToggle,
  onTransition,
  busy,
}: {
  order: AdminOrderRow
  selected: boolean
  onToggle: () => void
  onTransition: (to: string) => void
  busy: boolean
}) {
  const actions = NEXT_STATUS[order.status] ?? []
  return (
    <tr className="border-b border-neutral-100 text-neutral-800 last:border-0">
      <td className="px-3 py-2">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${order.code}`} />
      </td>
      <td className="px-3 py-2 font-mono text-xs">{order.code}</td>
      <td className="px-3 py-2">
        <span className="block">{order.customer_name}</span>
        <span className="block text-xs text-neutral-400">{order.customer_phone}</span>
      </td>
      <td className="px-3 py-2 text-neutral-600">{order.delivery_date}</td>
      <td className="px-3 py-2 text-right font-medium">{formatPaise(order.total_paise)}</td>
      <td className="px-3 py-2">
        <span className="inline-block bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-neutral-500">
        {order.run_id ? `#${order.run_id} · stop ${order.stop_position}` : "—"}
      </td>
      <td className="px-3 py-2 text-right">
        {actions.map((a) => (
          <button
            key={a.to}
            type="button"
            disabled={busy}
            onClick={() => onTransition(a.to)}
            className={`ml-1.5 border px-2 py-1 text-xs ${
              a.to === "cancelled"
                ? "border-red-300 text-red-600 hover:bg-red-50"
                : "border-neutral-300 hover:bg-neutral-50"
            } disabled:opacity-40`}
          >
            {a.label}
          </button>
        ))}
        {actions.length === 0 && <span className="text-xs text-neutral-300">—</span>}
      </td>
    </tr>
  )
}
