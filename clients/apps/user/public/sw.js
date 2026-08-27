const CACHE_NAME = "aarogya-ruchi-v4"
const urlsToCache = ["/manifest.json", "/favicon.ico", "/logo192.png", "/logo512.png"]

// Install event - cache assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache)
    })
  )
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return
  }

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
      })
  )
})

// ---- Web push ----
// Payload shape (from the Go API): {title, body, url, tag}. The tag
// collapses repeat notifications for the same chat thread / event.
// The server pushes to every subscribed device; a device that has the app
// open and visible stays silent (the message already arrived over WS).
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { body: event.data ? event.data.text() : "" }
  }
  const options = {
    body: data.body || "",
    icon: "/favicon-192.png?v=3",
    badge: "/favicon-192.png?v=3",
    tag: data.tag || "aarogya-ruchi",
    data: { url: data.url || "/" },
    vibrate: [200, 100, 200],
  }
  event.waitUntil(
    (async () => {
      const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true })
      if (windowClients.some((client) => client.visibilityState === "visible")) {
        return
      }
      await self.registration.showNotification(data.title || "Aarogya Ruchi", options)
    })(),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data ? event.notification.data.url || "/" : "/"
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
