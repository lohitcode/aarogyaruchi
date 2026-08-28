import { useEffect, useState } from "react"
import { BellOff, BellRing, X } from "lucide-react"
import {
  currentPermission,
  enablePush,
  reportPushState,
  subscribeQuietly,
  type PushState,
} from "../lib/push"

/**
 * Ops-console nudge shown above the page content while notification
 * permission is not granted. Dismissing hides it for the current visit
 * only — every fresh app open re-checks the permission until it is granted
 * (or the browser is incapable of notifications, in which case there is
 * nothing to ask for). Admins get push for customer messages and new
 * orders, so an unsubscribed console misses time-critical events.
 */
export function NotificationBanner() {
  // Evaluated only in the browser (effect below) so SSR markup and the
  // first client paint agree.
  const [permission, setPermission] = useState<PushState>("unsupported")
  const [dismissed, setDismissed] = useState(false)
  const [enabling, setEnabling] = useState(false)

  useEffect(() => {
    const state = currentPermission()
    setPermission(state)
    // Report on every app open.
    reportPushState()
    // Keep previously-granted devices subscribed (browsers drop
    // subscriptions); this used to happen only on the /users page.
    if (state === "granted") subscribeQuietly()

    // Permission can change outside our UI (browser site settings).
    const onFocus = () => {
      const next = currentPermission()
      setPermission((prev) => {
        if (prev !== next) reportPushState()
        return next
      })
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [])

  const turnOn = async () => {
    if (enabling) return
    setEnabling(true)
    try {
      setPermission(await enablePush())
      reportPushState()
    } finally {
      setEnabling(false)
    }
  }

  if (dismissed) return null
  if (permission === "granted" || permission === "unsupported") return null

  const blocked = permission === "denied"
  return (
    <div className="no-print flex items-start gap-3 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-neutral-800">
      {blocked ? (
        <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      ) : (
        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {blocked
            ? "Notifications are blocked in this browser"
            : "Turn on notifications"}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-neutral-600">
          {blocked
            ? "Allow notifications for this site in your browser settings to get customer messages and new-order alerts."
            : "Get customer messages and new-order alerts on this device."}
        </p>
        {!blocked && (
          <button
            type="button"
            onClick={turnOn}
            disabled={enabling}
            className="mt-2 border border-neutral-300 bg-white px-3 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-40"
          >
            {enabling ? "Enabling…" : "Enable notifications"}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification nudge"
        onClick={() => setDismissed(true)}
        className="p-1 text-neutral-400 hover:text-neutral-900"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
