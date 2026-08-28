import { Fragment, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { adminApi, type BatchDetail } from "../lib/admin"
import { formatPaise } from "../lib/api"
import { connectWs } from "../lib/ws"

export const Route = createFileRoute("/production")({
  component: AdminProduction,
})

type PrepRow = BatchDetail["preparation_summary"][number]

export type ProductPrepGroup = {
  product_id: number
  name: string
  slug: string
  totalQty: number
  variants: PrepRow[]
}

/**
 * Collapse the per-variant preparation summary into kitchen-sized product
 * groups: the number the production team cares about is "how many of each
 * product do we make", with the size split visible underneath. Biggest
 * prep first.
 */
export function groupPrepByProduct(rows: PrepRow[]): ProductPrepGroup[] {
  const byProduct = new Map<number, ProductPrepGroup>()
  for (const row of rows) {
    let group = byProduct.get(row.product_id)
    if (!group) {
      group = {
        product_id: row.product_id,
        name: row.name,
        slug: row.slug,
        totalQty: 0,
        variants: [],
      }
      byProduct.set(row.product_id, group)
    }
    group.variants.push(row)
    group.totalQty += row.total_quantity
  }
  return [...byProduct.values()].sort(
    (a, b) => b.totalQty - a.totalQty || a.name.localeCompare(b.name)
  )
}

export function variantLabel(v: { size_label: string; unit: string; slug: string }) {
  return [v.size_label, v.unit].filter(Boolean).join(" · ") || v.slug
}

function batchOptionLabel(b: {
  delivery_date: string
  order_count: number
  status: string
}) {
  const openTag = b.status === "open" ? " · open" : ""
  const plural = b.order_count === 1 ? "order" : "orders"
  return `Delivering ${b.delivery_date} · ${b.order_count} ${plural}${openTag}`
}

export function AdminProduction() {
  const queryClient = useQueryClient()
  // "" = follow today's batch (even before it exists); a batch id = pinned.
  const [pickedId, setPickedId] = useState<string>("")

  const current = useQuery({
    queryKey: ["admin-batch-current"],
    queryFn: () => adminApi.currentBatch(),
  })
  const batches = useQuery({
    queryKey: ["admin-batches"],
    queryFn: () => adminApi.batches(),
  })

  // Before the day's first order, /batches/current reports batch_id 0 —
  // the batch row is only created at checkout. Nothing to fetch then; the
  // sheet renders empty from the resolved header below.
  const currentId = current.data?.batch_id || null
  const batchId = pickedId !== "" ? Number(pickedId) : currentId
  const sheet = useQuery({
    queryKey: ["production-sheet", batchId ?? 0],
    queryFn: () => adminApi.batch(batchId as number),
    enabled: batchId != null,
  })

  // Keep the sheet live through the evening: every order placed before the
  // cutoff lands in today's batch and bumps the quantities to prepare.
  useEffect(() => {
    const close = connectWs({
      onEvent: (event) => {
        if (event.type.startsWith("order.") || event.type.startsWith("batch.")) {
          queryClient.invalidateQueries({ queryKey: ["production-sheet"] })
          queryClient.invalidateQueries({ queryKey: ["admin-batches"] })
          queryClient.invalidateQueries({ queryKey: ["admin-batch-current"] })
        }
      },
      onReconnect: () => {
        queryClient.invalidateQueries({ queryKey: ["production-sheet"] })
      },
    })
    return close
  }, [queryClient])

  // Header info comes from the fetched batch, or — for a day with no
  // orders yet — from the resolved current-batch header (dates, cutoff,
  // status are all known without a persisted row).
  const header: Pick<BatchDetail, "order_date" | "delivery_date" | "cutoff_policy" | "status"> | null =
    sheet.data ?? (currentId == null ? (current.data ?? null) : null)

  const groups = useMemo(
    () => groupPrepByProduct(sheet.data?.preparation_summary ?? []),
    [sheet.data]
  )
  const totalUnits = groups.reduce((sum, g) => sum + g.totalQty, 0)

  if (current.isLoading || (batchId != null && sheet.isLoading)) {
    return <p className="text-sm text-neutral-500">Loading…</p>
  }
  if (!header || sheet.error) {
    return <p className="text-sm text-red-600">Failed to load the production sheet.</p>
  }

  const { order_date, delivery_date, cutoff_policy, status } = header
  const todayPending = batchId == null // following today and no batch row exists yet
  const counts = sheet.data?.counts

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Production sheet</h1>
        <p className="text-sm text-neutral-500">
          Orders placed {order_date} · delivering {delivery_date}
        </p>
      </div>

      <div className="no-print mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <span className="whitespace-nowrap">Batch</span>
          <select
            value={pickedId}
            onChange={(e) => setPickedId(e.target.value)}
            className="border border-neutral-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">
              Today · delivering {current.data?.delivery_date ?? "…"}
            </option>
            {(batches.data?.batches ?? [])
              .filter((b) => b.batch_id !== currentId)
              .map((b) => (
                <option key={b.batch_id} value={b.batch_id}>
                  {batchOptionLabel(b)}
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => window.print()}
          className="border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Print sheet
        </button>
        <p className="text-xs text-neutral-400">{cutoff_policy}</p>
      </div>

      <section className="print:border-0 mt-4 border border-neutral-200 bg-white">
        {groups.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            {todayPending
              ? "No orders in today's batch yet — the sheet fills in as orders land (before the cutoff)."
              : `Nothing to prepare${status === "open" ? " — orders can still land (before the cutoff)" : ""}.`}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs tracking-wide text-neutral-500 uppercase">
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2 text-right">Prepare</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.product_id}>
                  <tr className="border-b border-neutral-200 bg-neutral-50/70 print:bg-white">
                    <td className="px-4 py-3 font-semibold text-neutral-900">{g.name}</td>
                    <td className="px-4 py-3 text-right text-lg font-bold tabular-nums">
                      {g.totalQty}
                    </td>
                  </tr>
                  {g.variants.map((v) => (
                    <tr
                      key={v.variant_id}
                      className="border-b border-neutral-100 last:border-0"
                    >
                      <td className="px-4 py-2 pl-9 text-neutral-600">
                        {variantLabel(v)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">
                        ×{v.total_quantity}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
        {counts && (
          <p className="border-t border-neutral-200 px-4 py-3 text-sm text-neutral-600 print:border-neutral-400">
            {counts.order_count} orders · {totalUnits} units ·{" "}
            {formatPaise(counts.total_paise)}
            {counts.cancelled_count > 0 && ` · ${counts.cancelled_count} cancelled`}
          </p>
        )}
      </section>
    </div>
  )
}
