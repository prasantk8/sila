/* SILA PWA service worker — shell cache-first, everything live network-first. */
const SHELL = "sila-shell-v1";
const ASSETS = ["/play", "/play/index.html", "/play/play.css", "/play/play.js", "/play/icon.svg", "/play/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/")) return;
  if (url.pathname.startsWith("/play")) {
    e.respondWith(
      caches.match(e.request, { ignoreSearch: url.pathname === "/play" }).then(
        (hit) => hit || fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(e.request, copy));
          return res;
        })
      )
    );
  }
});
