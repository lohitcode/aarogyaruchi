import { useQuery } from "@tanstack/react-query"
import {
  Bell,
  BellOff,
  BellRing,
  MapPin,
  Phone,
  User as UserIcon,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@aarogyaruchi/ui/components/dialog"

import { adminApi } from "../../lib/admin"

/**
 * Read-only customer profile for the chat: full name, phone, location,
 * address, and whether the customer can be reached by notifications.
 * Opened from the chat header and the customers list.
 */

type CustomerDetailsDialogProps = {
  userId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

type AdminUserNotification = {
  permission: "granted" | "denied" | "default" | "unsupported"
  reported_at: string
  push_subscribed: boolean
}

export function CustomerDetailsDialog({
  userId,
  open,
  onOpenChange,
}: CustomerDetailsDialogProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => adminApi.userDetail(userId),
    enabled: open,
    retry: 1,
  })

  const user = data?.user

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-md overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customer details</DialogTitle>
          <DialogDescription>
            Profile, delivery address, and notification reachability.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-6 text-center text-sm text-neutral-500">
            Loading…
          </p>
        ) : error || !user ? (
          <p className="py-6 text-center text-sm text-red-600">
            {error instanceof Error ? error.message : "Couldn't load this customer."}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 border border-neutral-200 bg-neutral-50 p-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white">
                {(user.name || user.phone).charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-900">
                  {user.name || "Customer"}
                </p>
                <p className="font-mono text-xs text-neutral-500">{user.phone}</p>
              </div>
            </div>

            <dl className="divide-y divide-neutral-100 border border-neutral-200 text-sm">
              <div className="flex items-start gap-2.5 px-3 py-2.5">
                <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
                <div>
                  <dt className="text-[11px] tracking-wide text-neutral-400 uppercase">
                    Phone
                  </dt>
                  <dd className="font-mono text-neutral-900">{user.phone}</dd>
                </div>
              </div>

              <div className="flex items-start gap-2.5 px-3 py-2.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
                <div>
                  <dt className="text-[11px] tracking-wide text-neutral-400 uppercase">
                    Location
                  </dt>
                  <dd className="text-neutral-900">
                    {user.address?.locality_name
                      ? [
                          user.address.locality_name,
                          user.address.locality_city,
                        ]
                          .filter(Boolean)
                          .join(", ")
                      : "—"}
                  </dd>
                </div>
              </div>

              <div className="flex items-start gap-2.5 px-3 py-2.5">
                <UserIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
                <div>
                  <dt className="text-[11px] tracking-wide text-neutral-400 uppercase">
                    Address
                  </dt>
                  <dd className="text-neutral-900">
                    {user.address ? (
                      <>
                        <span>{user.address.address_line}</span>
                        {user.address.landmark && (
                          <span className="block text-xs text-neutral-500">
                            Landmark: {user.address.landmark}
                          </span>
                        )}
                        {user.address.label && (
                          <span className="block text-xs text-neutral-500">
                            Label: {user.address.label}
                          </span>
                        )}
                        {user.address_count > 1 && (
                          <span className="block text-xs text-neutral-400">
                            + {user.address_count - 1} more saved address
                            {user.address_count > 2 ? "es" : ""}
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </div>

              <div className="flex items-start gap-2.5 px-3 py-2.5">
                {notificationIcon(user.notification)}
                <div>
                  <dt className="text-[11px] tracking-wide text-neutral-400 uppercase">
                    Notifications
                  </dt>
                  <dd>{notificationLabel(user.notification)}</dd>
                </div>
              </div>

              <div className="flex items-start gap-2.5 px-3 py-2.5">
                <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
                <div>
                  <dt className="text-[11px] tracking-wide text-neutral-400 uppercase">
                    Customer since
                  </dt>
                  <dd className="text-neutral-900">
                    {new Date(user.created_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </dd>
                </div>
              </div>
            </dl>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function notificationIcon(notification: AdminUserNotification | null | undefined) {
  if (!notification) return <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
  if (notification.permission === "granted")
    return <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
  if (notification.permission === "denied")
    return <BellOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
  return <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
}

function notificationLabel(notification: AdminUserNotification | null | undefined) {
  if (!notification) {
    return (
      <span className="text-neutral-500">
        Unknown — no device has reported yet
      </span>
    )
  }
  switch (notification.permission) {
    case "granted":
      return notification.push_subscribed ? (
        <span className="text-green-700">
          Allowed · subscribed on this customer's device
        </span>
      ) : (
        <span className="text-amber-700">
          Allowed · no active device subscription
        </span>
      )
    case "denied":
      return <span className="text-red-700">Blocked by the customer</span>
    case "unsupported":
      return (
        <span className="text-neutral-500">
          Device doesn't support notifications
        </span>
      )
    default:
      return (
        <span className="text-neutral-500">Not enabled (never asked)</span>
      )
  }
}
