import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { adminApi } from "../lib/admin"
import { formatPaise } from "../lib/api"
import { connectWs } from "../lib/ws"
import { useEffect, useState } from "react"
import { DateTimePicker } from "../components/admin/date-time-picker"
import { Button } from "@aarogyaruchi/ui/components/button"

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

// Relative presets are anchored when clicked; the applied window itself is
// a fixed query key, so refetches (WS invalidation) reuse the same window.
const PRESETS = [
  { key: "24h", label: "Last 24h", hours: 24 },
  { key: "7d", label: "Last 7 days", hours: 24 * 7 },
  { key: "30d", label: "Last 30 days", hours: 24 * 30 },
] as const

type DashboardRange = { start: Date; end: Date }

function AdminDashboard() {
  const queryClient = useQueryClient()
  // null range = the default delivery-day view (today's delivery_date).
  const [range, setRange] = useState<DashboardRange | null>(null)
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [draftStart, setDraftStart] = useState<Date | undefined>(undefined)
  const [draftEnd, setDraftEnd] = useState<Date | undefined>(undefined)

  const rangeKey = range
    ? `${range.start.toISOString()}..${range.end.toISOString()}`
    : "day"
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-dashboard", rangeKey],
    queryFn: () =>
      adminApi.dashboard(
        range
          ? { start: range.start.toISOString(), end: range.end.toISOString() }
          : undefined,
      ),
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

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setRange({ start: new Date(Date.now() - preset.hours * 3_600_000), end: new Date() })
    setActivePreset(preset.key)
    setDraftStart(undefined)
    setDraftEnd(undefined)
  }

  const applyDraft = () => {
    if (!draftStart || !draftEnd || draftStart >= draftEnd) {
      return
    }
    setRange({ start: draftStart, end: draftEnd })
    setActivePreset(null)
  }

  const backToDeliveryDay = () => {
    setRange(null)
    setActivePreset(null)
    setDraftStart(undefined)
    setDraftEnd(undefined)
  }

  const draftValid = Boolean(draftStart && draftEnd && draftStart < draftEnd)

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">Dashboard</h1>
        <p className="text-sm text-neutral-500">
          {range
            ? `${format(range.start, "d MMM yyyy, h:mm a")} → ${format(range.end, "d MMM yyyy, h:mm a")}`
            : data
              ? `Delivery ${data.delivery_date}`
              : ""}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <button type="button" onClick={backToDeliveryDay} className={chipClass(range === null)}>
          Today's delivery
        </button>
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => applyPreset(preset)}
            className={chipClass(activePreset === preset.key)}
          >
            {preset.label}
          </button>
        ))}
        <div className="mx-1 hidden h-8 w-px bg-neutral-200 sm:block" />
        <DateTimePicker id="dash-start" label="From" value={draftStart} onChange={setDraftStart} />
        <DateTimePicker id="dash-end" label="To" value={draftEnd} onChange={setDraftEnd} />
        <Button
          variant="outline"
          size="sm"
          onClick={applyDraft}
          disabled={!draftValid}
          className="h-9"
        >
          Apply
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-6 text-sm text-neutral-500">Loading…</p>
      ) : error || !data ? (
        <p className="mt-6 text-sm text-red-600">Failed to load dashboard.</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Orders" value={String(data.order_count)} />
            <Stat
              label="Order value"
              value={formatPaise(data.total_paise)}
              sub={
                data.order_count > 0
                  ? `Avg ${formatPaise(Math.round(data.total_paise / data.order_count))}`
                  : undefined
              }
            />
            <Stat label="Active runs" value={String(data.active_runs)} />
            <Stat label="Total runs" value={String(data.run_count)} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="border border-neutral-200 bg-white">
              <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-900">
                Orders by status
              </h2>
              {Object.keys(data.by_status).length === 0 ? (
                <p className="px-4 py-6 text-sm text-neutral-500">
                  {range ? "No orders in this range." : "No orders for this date."}
                </p>
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
        </>
      )}
    </div>
  )
}

function chipClass(active: boolean): string {
  return `border px-3 py-1.5 text-sm transition-colors ${
    active
      ? "border-neutral-900 bg-neutral-900 text-white"
      : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
  }`
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-neutral-200 bg-white p-4">
      <p className="text-xs tracking-wide text-neutral-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-neutral-500">{sub}</p> : null}
    </div>
  )
}
