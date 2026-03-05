const CACHE_NAME = "arinova-v3";
const PRECACHE_URLS = ["/", "/login", "/register"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ===== Push Notifications =====

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Arinova Chat", body: event.data.text() };
  }

  const { title = "Arinova Chat", body = "", url, type, message_id, data } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: type || "default",
      data: { url, type, message_id, ...data },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawUrl = event.notification.data?.url || "/";
  // Resolve to absolute URL using SW scope (handles non-root PWA deployments)
  const scope = self.registration.scope;
  let absoluteUrl;
  try {
    const resolved = new URL(rawUrl, scope);
    // Only allow same-origin URLs; fallback to scope root for external
    absoluteUrl = resolved.origin === new URL(scope).origin ? resolved.href : scope;
  } catch {
    absoluteUrl = scope;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          try {
            await client.focus();
          } catch {
            // focus() can fail if window is not focusable
          }
          client.postMessage({ type: "NOTIFICATION_CLICK", url: rawUrl });
          return;
        }
      }
      // No existing window — open new one with absolute URL
      return self.clients.openWindow(absoluteUrl);
    })
  );
});

// ===== Fetch Caching =====

self.addEventListener("fetch", (event) => {
  // Skip non-GET and API/WS requests
  if (
    event.request.method !== "GET" ||
    event.request.url.includes("/api/") ||
    event.request.url.includes("/ws") ||
    event.request.url.includes("localhost:21001")
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful page/asset responses
        if (response.ok && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
