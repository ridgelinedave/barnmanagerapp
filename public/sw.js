/*
 * Service worker — deliberately minimal.
 *
 * Rules:
 *  - Never cache authentication, API calls, or anything with a session in it.
 *    A stale authenticated page served to the wrong user is a security bug, not
 *    a caching bug.
 *  - Navigations are network-first with an offline fallback page.
 *  - Same-origin static assets are cache-first (they are content-hashed).
 *
 * Bump CACHE_VERSION whenever the offline page or the precache list changes.
 */
const CACHE_VERSION = "v1";
const CACHE_NAME = `crouse-barn-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Paths that must always hit the network. */
function isNeverCached(url) {
  return (
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/sign-in"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cross-origin (Supabase, fonts) and auth traffic: straight to the network.
  if (url.origin !== self.location.origin || isNeverCached(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      }),
    );
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/");

  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
