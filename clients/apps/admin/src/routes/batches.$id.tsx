import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { adminApi } from "../lib/admin"
import { formatPaise } from "../lib/api"

export const Route = createFileRoute("/batches/$id")({
  component: AdminBatchDetail,
})

function AdminBatchDetail() {
  const { id } = Route.useParams()
  const batchId = Number(id)
  const queryClient = useQueryClient()
  const [message, setMessage] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["admin-batch", batchId],
    queryFn: () => adminApi.batch(batchId),
  })

  const close = useMutation({
    mutationFn: () => adminApi.closeBatch(batchId),
    onSuccess: () => {
      setMessage("Batch closed. New orders will join the next batch.")
      queryClient.invalidateQueries({ queryKey: ["admin-batch", batchId] })
      queryClient.invalidateQueries({ queryKey: ["admin-batches"] })
    },
    onError: (err) => setMessage(err.message),
  })

  if (isLoading) return <p className="text-sm text-neutral-500">Loading…</p>
  if (!data) return <p className="text-sm text-red-600">Batch not found.</p>

  const printLabels = () => {
    window.open(adminApi.batchLabelsUrl(batchId), "_blank", "noopener")
  }

  return (
    <div>
      <Link to="/batches" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← All batches
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">
          Batch {data.order_date}
          <span className="mt-1 block text-sm font-normal text-neutral-500 sm:ml-3 sm:inline">
            delivered {data.delivery_date} · {data.cutoff_policy}
          </span>
        </h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={printLabels}
            className="border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Print {data.counts.order_count} labels
          </button>
          {data.status === "open" && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Close this batch early? New orders will roll to the next batch. This cannot be undone.")) {
                  close.mutate()
                }
              }}
              disabled={close.isPending}
              className="border border-red-300 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              Close batch
            </button>
          )}
        </div>
      </div>
      {message && <p className="mt-2 text-sm text-neutral-600">{message}</p>}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="border border-neutral-200 bg-white">
          <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">
            Preparation summary ({data.counts.order_count} active orders ·{" "}
            {formatPaise(data.counts.total_paise)})
          </h2>
          {data.preparation_summary.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-500">Nothing to prepare.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs tracking-wide text-neutral-500 uppercase">
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2 text-right">Total qty</th>
                  <th className="px-4 py-2 text-right">In orders</th>
                </tr>
              </thead>
              <tbody>
                {data.preparation_summary.map((p) => (
                  <tr key={p.variant_id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2">
                      {p.name}
                      {p.size_label ? <span className="text-neutral-400"> · {p.size_label}</span> : null}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">{p.total_quantity}</td>
                    <td className="px-4 py-2 text-right text-neutral-500">{p.order_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="border border-neutral-200 bg-white">
          <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">Orders</h2>
          <ul className="divide-y divide-neutral-100">
            {data.orders.map((o) => (
              <li key={o.order_id} className="flex flex-col gap-1 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="font-mono text-xs text-neutral-600">{o.code}</span>
                <span className="text-neutral-500">{o.status}</span>
                <span className="font-medium">{formatPaise(o.total_paise)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
