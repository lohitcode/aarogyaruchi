import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { adminApi } from "../lib/admin"
import { formatPaise } from "../lib/api"

export const Route = createFileRoute("/batches/")({
  component: AdminBatches,
})

function AdminBatches() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-batches"],
    queryFn: () => adminApi.batches(),
  })

  const batches = data?.batches ?? []

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Daily batches</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Orders placed during a business day (Asia/Kolkata) form one batch, delivered the following
        morning.
      </p>

      <div className="mt-5 border border-neutral-200 bg-white">
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-neutral-500">Loading…</p>
        ) : batches.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-500">No batches yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs tracking-wide text-neutral-500 uppercase">
                  <th className="px-4 py-2">Order date</th>
                  <th className="px-4 py-2">Delivery</th>
                  <th className="px-4 py-2 text-right">Orders</th>
                  <th className="px-4 py-2 text-right">Delivered</th>
                  <th className="px-4 py-2 text-right">Value</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.batch_id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                    <td className="px-4 py-2.5">
                      <Link
                        to="/batches/$id"
                        params={{ id: String(b.batch_id) }}
                        className="font-medium text-neutral-900 hover:underline"
                      >
                        {b.order_date}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">{b.delivery_date}</td>
                    <td className="px-4 py-2.5 text-right">{b.order_count}</td>
                    <td className="px-4 py-2.5 text-right text-neutral-600">{b.delivered_count}</td>
                    <td className="px-4 py-2.5 text-right">{formatPaise(b.total_paise)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs ${
                          b.status === "open" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
