/* Network-first service worker: always fresh content (admin publishes show
   up immediately), with an offline fallback to the last cached copy. */
const CACHE = "portfolio-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(
    caches.keys()
        .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
        .then(() => self.clients.claim())
));

self.addEventListener("fetch", e => {
    const req = e.request;
    const url = new URL(req.url);
    if (req.method !== "GET" || url.origin !== location.origin || url.pathname.includes("admin")) return;
    e.respondWith(
        fetch(req).then(res => {
            if (res.ok) {
                const copy = res.clone();
                caches.open(CACHE).then(c => c.put(req, copy));
            }
            return res;
        }).catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
});
