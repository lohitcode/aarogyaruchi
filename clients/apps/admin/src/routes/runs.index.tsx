import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { adminApi } from "../lib/admin"

export const Route = createFileRoute("/runs/")({
  component: AdminRuns,
})

function AdminRuns() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [batchId, setBatchId] = useState("")
  const [partnerId, setPartnerId] = useState("")
  const [localityId, setLocalityId] = useState("")
  const [name, setName] = useState("")
  const [message, setMessage] = useState("")

  const runsQuery = useQuery({ queryKey: ["admin-runs"], queryFn: () => adminApi.runs() })
  const batchesQuery = useQuery({ queryKey: ["admin-batches"], queryFn: () => adminApi.batches() })
  const partnersQuery = useQuery({ queryKey: ["admin-partners"], queryFn: () => adminApi.partners() })
  const localitiesQuery = useQuery({ queryKey: ["admin-localities"], queryFn: () => adminApi.localities() })

  const create = useMutation({
    mutationFn: () =>
      adminApi.createRun({
        batch_id: Number(batchId),
        partner_id: partnerId ? Number(partnerId) : undefined,
        locality_id: localityId ? Number(localityId) : undefined,
        name: name || undefined,
      }),
    onSuccess: (res) => {
      setMessage(`Run #${res.run_id} created with ${res.stops} stops.`)
      setShowCreate(false)
      setBatchId("")
      setPartnerId("")
      setLocalityId("")
      setName("")
      queryClient.invalidateQueries({ queryKey: ["admin-runs"] })
    },
    onError: (err) => setMessage(err.message),
  })

  const runs = runsQuery.data?.runs ?? []

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Delivery runs</h1>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          {showCreate ? "Cancel" : "New run"}
        </button>
      </div>

      {message && <p className="mt-2 text-sm text-neutral-600">{message}</p>}

      {showCreate && (
        <form
          className="mt-4 grid gap-3 border border-neutral-200 bg-white p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (batchId) create.mutate()
          }}
        >
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600">Batch</span>
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className="w-full border border-neutral-300 px-2 py-1.5"
              required
            >
              <option value="">Select batch…</option>
              {(batchesQuery.data?.batches ?? []).map((b) => (
                <option key={b.batch_id} value={b.batch_id}>
                  {b.order_date} → {b.delivery_date} ({b.order_count} orders)
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600">Partner (optional now, required to dispatch)</span>
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              className="w-full border border-neutral-300 px-2 py-1.5"
            >
              <option value="">Unassigned</option>
              {(partnersQuery.data?.partners ?? []).map((p) => (
                <option key={p.partner_id} value={p.partner_id}>
                  {p.name || p.phone}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600">Fill from locality (ready orders)</span>
            <select
              value={localityId}
              onChange={(e) => setLocalityId(e.target.value)}
              className="w-full border border-neutral-300 px-2 py-1.5"
            >
              <option value="">All localities</option>
              {(localitiesQuery.data?.localities ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600">Run name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bachupally AM"
              className="w-full border border-neutral-300 px-2 py-1.5"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={!batchId || create.isPending}
              className="bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {create.isPending ? "Creating…" : "Create run from ready orders"}
            </button>
            <p className="mt-1.5 text-xs text-neutral-500">
              Only orders in the selected batch that are already <em>ready</em> are added. Build the
              route order on the run page afterwards.
            </p>
          </div>
        </form>
      )}

      <div className="mt-5 border border-neutral-200 bg-white">
        {runsQuery.isLoading ? (
          <p className="px-4 py-6 text-sm text-neutral-500">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-500">No runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs tracking-wide text-neutral-500 uppercase">
                  <th className="px-4 py-2">Run</th>
                  <th className="px-4 py-2">Delivery</th>
                  <th className="px-4 py-2">Partner</th>
                  <th className="px-4 py-2 text-right">Stops</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.run_id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                    <td className="px-4 py-2.5">
                      <Link
                        to="/runs/$id"
                        params={{ id: String(r.run_id) }}
                        className="font-medium text-neutral-900 hover:underline"
                      >
                        #{r.run_id} {r.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">{r.delivery_date}</td>
                    <td className="px-4 py-2.5 text-neutral-600">{r.partner_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right">{r.stop_count}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                        {r.status}
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
