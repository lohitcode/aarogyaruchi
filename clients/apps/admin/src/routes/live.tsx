import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { adminApi } from "../lib/admin"
import { connectWs } from "../lib/ws"
import PointsMap, { type MapPoint } from "../components/map/points-map"

export const Route = createFileRoute("/live")({
  component: AdminLive,
})

type ActiveRun = {
  run_id: number
  partner_id: number
  partner_name: string
  delivery_date: string
  location?: { latitude: number; longitude: number; recorded_at?: string; is_live?: boolean; age_seconds?: number }
}

function AdminLive() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["admin-live"],
    queryFn: () => adminApi.activeRuns(),
    refetchInterval: 15000,
  })

  useEffect(() => {
    const close = connectWs({
      onEvent: (event) => {
        if (event.type === "partner.location_updated" || event.type.startsWith("run.")) {
          queryClient.invalidateQueries({ queryKey: ["admin-live"] })
        }
      },
      onReconnect: () => queryClient.invalidateQueries({ queryKey: ["admin-live"] }),
    })
    return close
  }, [queryClient])

  const runs = (data?.runs ?? []) as ActiveRun[]
  const points: MapPoint[] = runs
    .filter((r) => r.location)
    .map((r) => ({
      id: `run-${r.run_id}`,
      lat: r.location!.latitude,
      lng: r.location!.longitude,
      label: `${r.partner_name} · Run #${r.run_id}${r.location!.is_live === false ? " (last known)" : ""}`,
      kind: "partner" as const,
    }))

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Live map</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Partner positions for dispatched and in-progress runs. Updates stream over WebSocket; the
        page also refetches every 15s. Positions older than two minutes show as last known.
      </p>

      {isLoading ? (
        <p className="mt-6 text-sm text-neutral-500">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">No active runs right now.</p>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="border border-neutral-200 bg-white lg:col-span-2">
            {points.length > 0 ? (
              <PointsMap points={points} zoom={12} height={420} />
            ) : (
              <p className="px-4 py-16 text-center text-sm text-neutral-500">
                No GPS fixes reported yet — partners share location once a run is dispatched.
              </p>
            )}
          </div>
          <div className="border border-neutral-200 bg-white">
            <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">Active runs</h2>
            <ul className="divide-y divide-neutral-100">
              {runs.map((r) => (
                <li key={r.run_id} className="px-4 py-3 text-sm">
                  <p className="font-medium text-neutral-900">
                    Run #{r.run_id} · {r.partner_name}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {r.delivery_date} ·{" "}
                    {r.location
                      ? r.location.is_live === false
                        ? `last known ${r.location.age_seconds ?? "?"}s ago`
                        : "live"
                      : "no GPS yet"}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
