import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { adminApi } from "../lib/admin"
import { formatPaise } from "../lib/api"

export const Route = createFileRoute("/cash")({
  component: AdminCash,
})

function AdminCash() {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState<number | null>(null)
  const [amount, setAmount] = useState("")
  const [message, setMessage] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["admin-handovers"],
    queryFn: () => adminApi.handovers(),
  })

  const confirm = useMutation({
    mutationFn: ({ runId, paise }: { runId: number; paise: number }) =>
      adminApi.confirmHandover(runId, paise),
    onSuccess: (_d, vars) => {
      setMessage(`Run #${vars.runId} reconciled.`)
      setConfirming(null)
      setAmount("")
      queryClient.invalidateQueries({ queryKey: ["admin-handovers"] })
    },
    onError: (e) => setMessage(e.message),
  })

  const handovers = data?.handovers ?? []

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Cash reconciliation</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Partners submit the cash they hand over; confirming it here closes the run as reconciled.
        Discrepancies are recorded permanently.
      </p>
      {message && <p className="mt-2 text-sm text-neutral-600">{message}</p>}

      <div className="mt-5 border border-neutral-200 bg-white">
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-neutral-500">Loading…</p>
        ) : handovers.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-500">No cash handovers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs tracking-wide text-neutral-500 uppercase">
                  <th className="px-4 py-2">Run</th>
                  <th className="px-4 py-2">Partner</th>
                  <th className="px-4 py-2 text-right">Expected</th>
                  <th className="px-4 py-2 text-right">Submitted</th>
                  <th className="px-4 py-2 text-right">Discrepancy</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {handovers.map((h) => (
                  <tr key={h.run_id} className="border-b border-neutral-100 text-neutral-800 last:border-0">
                    <td className="px-4 py-2.5">
                      #{h.run_id}
                      <span className="block text-xs text-neutral-400">{h.delivery_date}</span>
                    </td>
                    <td className="px-4 py-2.5">{h.partner_name}</td>
                    <td className="px-4 py-2.5 text-right">{formatPaise(h.expected_paise)}</td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {h.submitted_paise ? formatPaise(h.submitted_paise) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {h.discrepancy_paise ? (
                        <span className={h.discrepancy_paise < 0 ? "text-red-600" : "text-green-700"}>
                          {formatPaise(h.discrepancy_paise)}
                        </span>
                      ) : h.status === "confirmed" ? (
                        "₹0"
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs ${
                          h.status === "confirmed"
                            ? "bg-green-50 text-green-700"
                            : h.status === "submitted"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        {h.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {h.status === "submitted" &&
                        (confirming === h.run_id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={amount}
                              onChange={(e) => setAmount(e.target.value)}
                              placeholder="paise"
                              aria-label="Confirmed amount in paise"
                              className="w-24 border border-neutral-300 px-2 py-1 text-right text-xs"
                            />
                            <button
                              type="button"
                              disabled={!amount || confirm.isPending}
                              onClick={() => confirm.mutate({ runId: h.run_id, paise: Number(amount) })}
                              className="bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-40"
                            >
                              Confirm
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirming(h.run_id)
                              setAmount(String(h.submitted_paise))
                            }}
                            className="border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50"
                          >
                            Reconcile
                          </button>
                        ))}
                      {h.status === "pending" && <span className="text-xs text-neutral-400">awaiting partner</span>}
                      {h.status === "confirmed" && <span className="text-xs text-neutral-400">done</span>}
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
