/* Macro Cooks service worker — network-first for the app shell, cache fallback offline */
const CACHE = "macrocooks-v6";
const SHELL = ["./", "./manifest.webmanifest", "./icon-512.svg", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  // Precache the shell, tolerating any single missing asset (addAll is all-or-nothing; add() per-URL isn't).
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.allSettled(SHELL.map(function (u) { return cache.add(u); }));
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;

  // The HTML document: ALWAYS try the network first so updates show immediately.
  const isDoc = req.mode === "navigate" || (req.headers.get("accept") || "").indexOf("text/html") !== -1;
  if (isDoc) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        // Offline: serve the cached document, then the cached start URL as a last resort.
        return caches.open(CACHE).then(function (cache) {
          return cache.match(req).then(function (h) {
            if (h) return h;
            return cache.match("./index.html").then(function (h2) {
              return h2 || cache.match("./");
            });
          });
        });
      })
    );
    return;
  }

  // Everything else (icons, manifest, etc.): stale-while-revalidate.
  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (hit) {
        const net = fetch(req).then(function (res) {
          if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) cache.put(req, res.clone());
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      });
    })
  );
});
