const CACHE_NAME = "rjk-control-tower-v10";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (cacheNames) {
        return Promise.all(
          cacheNames.map(function (cacheName) {
            return caches.delete(cacheName);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  /*
   * HTML, JavaScript aur config hamesha
   * internet se latest load honge.
   */
  if (
    requestUrl.pathname.endsWith(".js") ||
    requestUrl.pathname.endsWith(".html") ||
    requestUrl.pathname.endsWith("/") ||
    requestUrl.pathname.includes("/vehicle-tracker")
  ) {
    event.respondWith(
      fetch(event.request, {
        cache: "no-store"
      }).catch(function () {
        return caches.match(event.request);
      })
    );

    return;
  }

  event.respondWith(
    fetch(event.request)
      .catch(function () {
        return caches.match(event.request);
      })
  );
});
