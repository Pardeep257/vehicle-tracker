const CACHE_NAME = "rjk-control-tower-v4";

const STATIC_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", function (event) {
  self.skipWaiting();

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(STATIC_FILES);
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (cacheNames) {
        return Promise.all(
          cacheNames.map(function (cacheName) {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
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
   * config.js ko kabhi old cache se load nahi karna.
   */
  if (
    requestUrl.pathname.endsWith(
      "/config.js"
    )
  ) {
    event.respondWith(
      fetch(event.request, {
        cache: "no-store"
      })
    );

    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        const responseCopy =
          response.clone();

        caches
          .open(CACHE_NAME)
          .then(function (cache) {
            cache.put(
              event.request,
              responseCopy
            );
          });

        return response;
      })
      .catch(function () {
        return caches.match(
          event.request
        );
      })
  );
});
