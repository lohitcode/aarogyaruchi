import { useEffect } from "react"

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }

    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister()
        }
      })

      caches.keys().then((cacheNames) => {
        for (const cacheName of cacheNames) {
          caches.delete(cacheName)
        }
      })

      return
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {

        // Check for updates
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                // New version available
                if (window.confirm("New version available! Refresh to update?")) {
                  window.location.reload()
                }
              }
            })
          }
        })
      })
      .catch((error) => {
        console.error("SW registration failed:", error)
      })

  }, [])

  return null
}
