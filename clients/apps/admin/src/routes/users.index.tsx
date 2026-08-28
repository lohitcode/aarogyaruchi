import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Bell, MessageCircle } from "lucide-react"
import { adminApi } from "../lib/admin"
import { connectWs } from "../lib/ws"
import { currentPermission, enablePush, pushSupported, subscribeQuietly } from "../lib/push"
import { CustomerDetailsDialog } from "../components/admin/customer-details-dialog"

export const Route = createFileRoute("/users/")({
  component: AdminUsers,
})

type UserRow = {
  user_id: number
  phone: string
  name?: string
  created_at: string
  order_count: number
  thread_id?: number | null
  last_message?: string
  last_at?: string
  unread_count?: number
}

const timeOf = (v?: string) => (v ? Date.parse(v) || 0 : 0)

function AdminUsers() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [detailsUserId, setDetailsUserId] = useState<number | null>(null)
  const [pushState, setPushState] = useState<"subscribing" | "granted" | "denied" | "default" | "unsupported">(
    currentPermission() === "granted" ? "subscribing" : currentPermission(),
  )
  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminApi.users(),
  })

  useEffect(() => {
    const close = connectWs({
      onEvent: (event) => {
        if (event.type === "chat.message_new") {
          queryClient.invalidateQueries({ queryKey: ["admin-users"] })
        }
      },
      onReconnect: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
    })
    // Re-subscribe this device if the operator previously allowed push.
    subscribeQuietly().then((ok) => setPushState(ok ? "granted" : "default"))
    return close
  }, [queryClient])

  // WhatsApp-style ordering: search matches come first (priority 1), and
  // within them rows sort by most recent message (priority 2). Customers
  // without a thread keep DB order (newest created) after threaded ones.
  const users = useMemo(() => {
    const rows = ((data?.users ?? []) as UserRow[]).slice()
    rows.sort(
      (a, b) =>
        timeOf(b.last_at) - timeOf(a.last_at) ||
        timeOf(b.created_at) - timeOf(a.created_at),
    )
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((u) => u.phone.includes(q) || (u.name ?? "").toLowerCase().includes(q))
  }, [data, search])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">Customers</h1>
        {pushSupported() && pushState === "default" && (
          <button
            type="button"
            onClick={async () => setPushState(await enablePush())}
            className="flex items-center gap-2 border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            <Bell className="h-4 w-4" />
            Notify me about customer messages
          </button>
        )}
        {pushState === "granted" && (
          <span className="flex items-center gap-1.5 text-xs text-neutral-500">
            <Bell className="h-3.5 w-3.5 text-green-600" />
            Push notifications on
          </span>
        )}
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search phone or name"
        aria-label="Search customers"
        className="mt-4 w-full border border-neutral-300 px-3 py-1.5 text-sm sm:w-64"
      />

      <div className="mt-4 border border-neutral-200 bg-white">
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-neutral-500">Loading…</p>
        ) : users.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-500">No customers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs tracking-wide text-neutral-500 uppercase">
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2 text-right">Orders</th>
                  <th className="px-4 py-2">Last message</th>
                  <th className="px-4 py-2 text-right">Chat</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.user_id} className="border-b border-neutral-100 text-neutral-800 last:border-0 hover:bg-neutral-50">
                    <td className="px-4 py-2.5 font-mono text-xs">{u.phone}</td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setDetailsUserId(u.user_id)}
                        className="text-left hover:underline"
                      >
                        {u.name || "—"}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right">{u.order_count}</td>
                    <td className="max-w-xs px-4 py-2.5">
                      {u.thread_id ? (
                        <>
                          <span className="block truncate text-neutral-600">{u.last_message}</span>
                          {u.unread_count ? (
                            <span className="mt-0.5 inline-block bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                              {u.unread_count} new
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        to="/users/$id"
                        params={{ id: String(u.user_id) }}
                        className="inline-flex items-center gap-1.5 border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Chat
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailsUserId !== null && (
        <CustomerDetailsDialog
          userId={detailsUserId}
          open
          onOpenChange={(next) => {
            if (!next) setDetailsUserId(null)
          }}
        />
      )}
    </div>
  )
}
