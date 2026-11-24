// Offline support: pages are network-first (so a new deploy shows up on the next
// open), everything else stale-while-revalidate. Vite's hashed asset names mean old
// files never go stale.
//
// Production and every PR preview share one origin (previews live under
// pr-preview/pr-N/), so each deployment's worker keeps its own cache, named after its
// scope, and the production worker leaves preview pages alone.
const VERSION = "groan-tubes-v5";
const SCOPE = self.registration.scope;
const CACHE = `${VERSION} ${SCOPE}`;
const PREVIEWS = new URL("./pr-preview/", SCOPE).pathname;
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // Clear this deployment's old caches, plus the pre-v5 unscoped ones; never
      // another deployment's.
      .then((keys) => keys.filter((k) => k !== CACHE && (k.endsWith(` ${SCOPE}`) || !k.includes(" "))))
      .then((stale) => Promise.all(stale.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // A preview has its own worker; don't let production cache or serve it.
  if (url.pathname.startsWith(PREVIEWS)) return;

  if (req.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        try {
          const res = await fetch(req);
          if (res.ok) cache.put("./index.html", res.clone());
          return res;
        } catch {
          return (await cache.match("./index.html")) ?? Response.error();
        }
      }),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => undefined);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return (await network) ?? Response.error();
    }),
  );
});
