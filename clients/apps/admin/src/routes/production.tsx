import { Fragment, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { adminApi, type BatchDetail, type BatchRow } from "../lib/admin"
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

function AdminProduction() {
  const queryClient = useQueryClient()
  // null = follow the current (today's) batch until the picker is used.
  const [pickedId, setPickedId] = useState<number | null>(null)

  const current = useQuery({
    queryKey: ["admin-batch-current"],
    queryFn: () => adminApi.currentBatch(),
  })
  const batches = useQuery({
    queryKey: ["admin-batches"],
    queryFn: () => adminApi.batches(),
  })

  const batchId = pickedId ?? current.data?.batch_id ?? null
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

  // The picker lists recent batches; the current batch may be brand new
  // (created empty) and missing from the list until the next refresh —
  // splice it in so the default selection is always present.
  const options: BatchRow[] = useMemo(() => {
    const list = batches.data?.batches ?? []
    if (current.data && !list.some((b) => b.batch_id === current.data.batch_id)) {
      return [
        {
          batch_id: current.data.batch_id,
          order_date: current.data.order_date,
          delivery_date: current.data.delivery_date,
          cutoff_policy: current.data.cutoff_policy,
          status: current.data.status,
          order_count: sheet.data?.counts.order_count ?? 0,
          cancelled_count: 0,
          delivered_count: 0,
          total_paise: 0,
        },
        ...list,
      ]
    }
    return list
  }, [batches.data, current.data, sheet.data])

  const groups = useMemo(
    () => groupPrepByProduct(sheet.data?.preparation_summary ?? []),
    [sheet.data]
  )
  const totalUnits = groups.reduce((sum, g) => sum + g.totalQty, 0)

  if (sheet.isLoading) {
    return <p className="text-sm text-neutral-500">Loading…</p>
  }
  if (sheet.error || !sheet.data) {
    return <p className="text-sm text-red-600">Failed to load the production sheet.</p>
  }

  const { counts, order_date, delivery_date, cutoff_policy, status } = sheet.data

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
            value={batchId ?? ""}
            onChange={(e) => setPickedId(Number(e.target.value))}
            disabled={batchId == null}
            className="border border-neutral-300 bg-white px-2 py-1.5 text-sm"
          >
            {batchId == null && <option value="">Loading…</option>}
            {options.map((b) => (
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
            Nothing to prepare yet — the sheet fills in as orders land
            {status === "open" ? " (before the cutoff)" : ""}.
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
        <p className="border-t border-neutral-200 px-4 py-3 text-sm text-neutral-600 print:border-neutral-400">
          {counts.order_count} orders · {totalUnits} units ·{" "}
          {formatPaise(counts.total_paise)}
          {counts.cancelled_count > 0 && ` · ${counts.cancelled_count} cancelled`}
        </p>
      </section>
    </div>
  )
}
