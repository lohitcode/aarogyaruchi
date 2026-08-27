import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"
import { adminApi, type StopRow } from "../lib/admin"
import { formatPaise } from "../lib/api"

export const Route = createFileRoute("/runs/$id")({
  component: AdminRunDetail,
})

function AdminRunDetail() {
  const { id } = Route.useParams()
  const runId = Number(id)
  const queryClient = useQueryClient()
  const [message, setMessage] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["admin-run", runId],
    queryFn: () => adminApi.run(runId),
  })
  const partnersQuery = useQuery({ queryKey: ["admin-partners"], queryFn: () => adminApi.partners() })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-run", runId] })

  const assign = useMutation({
    mutationFn: (partnerId: number) => adminApi.updateRun(runId, { partner_id: partnerId }),
    onSuccess: refresh,
    onError: (e) => setMessage(e.message),
  })
  const dispatch = useMutation({
    mutationFn: () => adminApi.dispatchRun(runId),
    onSuccess: () => {
      setMessage("Run dispatched to partner.")
      refresh()
    },
    onError: (e) => setMessage(e.message),
  })
  const cancel = useMutation({
    mutationFn: () => adminApi.updateRun(runId, { status: "cancelled" }),
    onSuccess: refresh,
    onError: (e) => setMessage(e.message),
  })
  const removeStop = useMutation({
    mutationFn: (stopId: number) => adminApi.removeStop(runId, stopId),
    onSuccess: refresh,
    onError: (e) => setMessage(e.message),
  })
  const reorder = useMutation({
    mutationFn: (stopIds: number[]) => adminApi.reorderStops(runId, stopIds),
    onSuccess: refresh,
    onError: (e) => setMessage(e.message),
  })

  if (isLoading) return <p className="text-sm text-neutral-500">Loading…</p>
  if (!data) return <p className="text-sm text-red-600">Run not found.</p>

  const stops = data.stops ?? []
  const editable = data.status === "draft" || data.status === "assigned"
  const stopIds = stops.map((s) => s.stop_id)

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= stopIds.length) return
    const next = [...stopIds]
    const tmp = next[index]
    next[index] = next[target]
    next[target] = tmp
    reorder.mutate(next)
  }

  return (
    <div>
      <Link to="/runs" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← All runs
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">
          Run #{data.run_id} {data.name}
          <span className="mt-1 block text-sm font-normal text-neutral-500 sm:ml-3 sm:inline">
            {data.delivery_date} · {data.status}
          </span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <>
              <select
                value={data.partner_id ?? ""}
                onChange={(e) => assign.mutate(Number(e.target.value))}
                aria-label="Assign partner"
                className="border border-neutral-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Assign partner…</option>
                {(partnersQuery.data?.partners ?? []).map((p) => (
                  <option key={p.partner_id} value={p.partner_id}>
                    {p.name || p.phone}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => dispatch.mutate()}
                disabled={!data.partner_id || dispatch.isPending}
                className="bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                Dispatch
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Cancel this run? Its orders return to ready.")) cancel.mutate()
                }}
                className="border border-red-300 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                Cancel run
              </button>
            </>
          )}
          <Link
            to="/live"
            className="border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Live map
          </Link>
        </div>
      </div>
      {message && <p className="mt-2 text-sm text-neutral-600">{message}</p>}

      {data.cash && (
        <p className="mt-3 text-sm text-neutral-600">
          Cash: {formatPaise(data.cash.collected_paise)} collected ·{" "}
          {formatPaise(data.cash.pending_paise)} pending · {formatPaise(data.cash.failed_paise)} failed
        </p>
      )}

      <div className="mt-5 border border-neutral-200 bg-white">
        {stops.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-500">No stops in this run.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs tracking-wide text-neutral-500 uppercase">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Address</th>
                  <th className="px-3 py-2 text-right">COD</th>
                  <th className="px-3 py-2">Stop status</th>
                  {editable && <th className="px-3 py-2 text-right">Route</th>}
                </tr>
              </thead>
              <tbody>
                {stops.map((s, i) => (
                  <StopRowView
                    key={s.stop_id}
                    stop={s}
                    index={i}
                    editable={editable}
                    first={i === 0}
                    last={i === stops.length - 1}
                    onMove={(dir) => move(i, dir)}
                    onRemove={() => removeStop.mutate(s.stop_id)}
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

function StopRowView({
  stop,
  index,
  editable,
  first,
  last,
  onMove,
  onRemove,
}: {
  stop: StopRow
  index: number
  editable: boolean
  first: boolean
  last: boolean
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  return (
    <tr className="border-b border-neutral-100 text-neutral-800 last:border-0">
      <td className="px-3 py-2.5 font-semibold text-neutral-500">{index + 1}</td>
      <td className="px-3 py-2.5">
        <span className="block font-mono text-xs">{stop.order_code}</span>
        <span className="block text-xs text-neutral-400">{stop.order_status}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className="block">{stop.customer_name}</span>
        <a href={`tel:${stop.customer_phone}`} className="block text-xs text-neutral-400 hover:text-neutral-700">
          {stop.customer_phone}
        </a>
      </td>
      <td className="max-w-xs px-3 py-2.5">
        <span className="block truncate text-neutral-600">{stop.address_line}</span>
        {stop.landmark ? <span className="block text-xs text-neutral-400">{stop.landmark}</span> : null}
        {stop.locality ? <span className="block text-xs text-neutral-400">{stop.locality}</span> : null}
      </td>
      <td className="px-3 py-2.5 text-right font-medium">{formatPaise(stop.total_paise)}</td>
      <td className="px-3 py-2.5">
        <span
          className={`inline-block px-2 py-0.5 text-xs ${
            stop.status === "delivered"
              ? "bg-green-50 text-green-700"
              : stop.status === "failed"
                ? "bg-red-50 text-red-600"
                : "bg-neutral-100 text-neutral-600"
          }`}
        >
          {stop.status}
        </span>
        {stop.collected_paise ? (
          <span className="block text-xs text-neutral-400">{formatPaise(stop.collected_paise)} cash</span>
        ) : null}
      </td>
      {editable && (
        <td className="px-3 py-2.5 text-right whitespace-nowrap">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={first}
            aria-label="Move stop up"
            className="border border-neutral-200 p-1 hover:bg-neutral-50 disabled:opacity-30"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={last}
            aria-label="Move stop down"
            className="ml-1 border border-neutral-200 p-1 hover:bg-neutral-50 disabled:opacity-30"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove stop"
            className="ml-1 border border-red-200 p-1 text-red-500 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  )
}
