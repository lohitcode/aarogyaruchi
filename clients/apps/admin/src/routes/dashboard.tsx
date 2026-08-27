import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { adminApi } from "../lib/admin"
import { formatPaise } from "../lib/api"
import { connectWs } from "../lib/ws"
import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"

export const Route = createFileRoute("/dashboard")({
  component: AdminDashboard,
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

function AdminDashboard() {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => adminApi.dashboard(),
  })

  useEffect(() => {
    const close = connectWs({
      onEvent: (event) => {
        if (event.type.startsWith("order.") || event.type.startsWith("batch.") || event.type.startsWith("run.")) {
          queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] })
        }
      },
      onReconnect: () => queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }),
    })
    return close
  }, [queryClient])

  if (isLoading) return <p className="text-sm text-neutral-500">Loading…</p>
  if (error || !data) return <p className="text-sm text-red-600">Failed to load dashboard.</p>

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Dashboard</h1>
        <p className="text-sm text-neutral-500">Delivery {data.delivery_date}</p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Orders" value={String(data.order_count)} />
        <Stat label="Order value" value={formatPaise(data.total_paise)} />
        <Stat label="Active runs" value={String(data.active_runs)} />
        <Stat label="Total runs" value={String(data.run_count)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="border border-neutral-200 bg-white">
          <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-900">
            Orders by status
          </h2>
          {Object.keys(data.by_status).length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-500">No orders for this date.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(data.by_status).map(([status, v]) => (
                  <tr key={status} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2 text-neutral-700">{STATUS_LABEL[status] ?? status}</td>
                    <td className="px-4 py-2 text-right font-medium text-neutral-900">{v.count}</td>
                    <td className="px-4 py-2 text-right text-neutral-500">{formatPaise(v.total_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="border border-neutral-200 bg-white">
          <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-900">
            Needs attention
          </h2>
          {data.needs_attention.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-500">All caught up.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {data.needs_attention.map((o) => (
                <li key={o.order_id} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <Link to="/orders" className="font-mono text-neutral-600 hover:text-neutral-900">
                    {o.code}
                  </Link>
                  <span className="text-neutral-500">{o.customer}</span>
                  <span className="font-medium text-neutral-800">{formatPaise(o.total_paise)}</span>
                  <span className="text-neutral-400">{STATUS_LABEL[o.status] ?? o.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-200 bg-white p-4">
      <p className="text-xs tracking-wide text-neutral-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900">{value}</p>
    </div>
  )
}
