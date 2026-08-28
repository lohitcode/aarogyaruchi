import { api } from "./api"

/**
 * Web-push subscription manager (customers and the admin console share it —
 * the server derives the role from the session cookie).
 *
 * Best practices baked in:
 * - The VAPID public key is fetched from the API, never bundled.
 * - Permission is only requested from an explicit user action; if it was
 *   granted previously we re-subscribe silently on login (subscriptions can
 *   be dropped by the browser).
 * - Denials are respected and surfaced as a soft state, never retried
 *   automatically.
 */

export type PushState = "unsupported" | "granted" | "denied" | "default"

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

export function currentPermission(): PushState {
  if (!pushSupported()) return "unsupported"
  return Notification.permission as PushState
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const base64_ = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64_)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

/**
 * Subscribe the current browser. Returns the resulting permission state.
 * Call from a user gesture (button click) the first time.
 */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported"

  const permission = await Notification.requestPermission()
  if (permission !== "granted") return permission as PushState

  const ok = await subscribeQuietly()
  return ok ? "granted" : "default"
}

/**
 * Re-subscribe without prompting; used when permission was already granted
 * (e.g. right after login). Returns true when an active subscription exists.
 */
export async function subscribeQuietly(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false
  try {
    const { public_key: publicKey } = await api.get<{ public_key: string }>(
      "/v1/push/public-key",
    )
    if (!publicKey) return false

    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
    }

    await api.post("/v1/push/subscribe", subscription.toJSON())
    return true
  } catch {
    return false
  }
}

/**
 * Report the current browser permission to the API (fire-and-forget). Called
 * on every app open and after any permission change; failures are ignored —
 * reporting is best-effort, never blocking.
 */
export function reportPushState(): void {
  const permission = currentPermission()
  api.post("/v1/push/permission", { permission }).catch(() => undefined)
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await api.post("/v1/push/unsubscribe", subscription.toJSON()).catch(() => undefined)
      await subscription.unsubscribe()
    }
  } catch {
    // Nothing to clean up.
  }
}
