// Service worker for the AR Operations admin app: installability + web
// push. Mirrors the customer site's worker (aarogyaruchi.com/sw.js) with
// admin branding and routes.
const CACHE_NAME = "ar-ops-v2"
const urlsToCache = ["/manifest.json", "/favicon.svg?v=2", "/icon-192.png?v=2"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache)
    }),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        }),
      )
    }),
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return
  }

  // Network-first: ops data must be fresh; the cache is only an offline
  // fallback for repeat visits.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200 && event.request.destination !== "document") {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
        }
        return response
      })
      .catch(() => {
        return caches.match(event.request).then((response) => {
          if (response) {
            return response
          }
          throw new Error("No cached response available")
        })
      }),
  )
})

// ---- Web push ----
// Payload shape (from the Go API): {title, body, url, tag}. The tag
// collapses repeat notifications for the same event (new orders share one
// tag so a morning rush shows the latest order, not a pile). The server
// pushes to every subscribed device; a device with a console window open
// and visible stays silent — the update already arrived over WS.
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { body: event.data ? event.data.text() : "" }
  }
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "ar-ops",
    data: { url: data.url || "/dashboard" },
    vibrate: [200, 100, 200],
  }
  event.waitUntil(
    (async () => {
      const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true })
      if (windowClients.some((client) => client.visibilityState === "visible")) {
        return
      }
      await self.registration.showNotification(data.title || "AR Operations", options)
    })(),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data ? event.notification.data.url || "/dashboard" : "/dashboard"
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus an already-open window at the target view instead of piling
      // up tabs; otherwise navigate the first open window or open a new one.
      for (const client of windowClients) {
        if (client.url.includes(url)) {
          return client.focus()
        }
      }
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    }),
  )
})
