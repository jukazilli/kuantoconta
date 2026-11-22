/*
 * kuantoconta Service Worker (Security-First PWA)
 *
 * Security invariant (docs/03-architecture/SECURITY.md):
 * - NEVER cache /api/*, /auth/*, /oauth/*, /.well-known/*, /dashboard, /legal/accept,
 *   RSC payloads, or any response marked `private`, `no-store`, or carrying `Set-Cookie`.
 * - ONLY cache immutable/public static assets (/_next/static/*, /icons/*, /banks/*)
 *   and the public /offline fallback page.
 */

const CACHE_PREFIX = "kc-static-";
const CACHE_NAME = "kc-static-v2";
const OFFLINE_URL = "/offline";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon.svg",
];

const FORBIDDEN_PREFIXES = [
  "/api/",
  "/auth/",
  "/oauth/",
  "/.well-known/",
  "/dashboard",
  "/legal/accept",
];

const CACHEABLE_PREFIXES = [
  "/_next/static/",
  "/icons/",
  "/banks/",
];

function isCacheableStaticRequest(request) {
  if (request.method !== "GET") return false;
  if (request.mode === "navigate") return false;
  if (request.headers.get("rsc") === "1") return false;
  if (request.headers.get("next-router-prefetch") === "1") return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.searchParams.has("_rsc")) return false;

  const { pathname } = url;
  if (pathname === OFFLINE_URL) return true;

  for (const prefix of FORBIDDEN_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix)) return false;
  }

  return CACHEABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isCacheableResponse(response) {
  if (!response || response.status !== 200 || response.type !== "basic") return false;
  const cc = (response.headers.get("cache-control") || "").toLowerCase();
  if (cc.includes("no-store") || cc.includes("private")) return false;
  if (response.headers.has("set-cookie")) return false;
  return true;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (type === "CLEAR_CACHES") {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith(CACHE_PREFIX))
              .map((key) => caches.delete(key))
          )
        )
    );
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept or cache API, auth, OAuth, or well-known endpoints.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/oauth/") ||
    url.pathname.startsWith("/.well-known/")
  ) {
    return;
  }

  // Navigations are strictly network-only so authenticated financial HTML is never cached.
  // If offline, serve the public /offline fallback page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedOffline = await caches.match(OFFLINE_URL);
        if (cachedOffline) return cachedOffline;
        return new Response("Você está sem conexão. Reconecte-se para acessar o kuantoconta.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      })
    );
    return;
  }

  // Static public assets: cache-first with background fill.
  if (isCacheableStaticRequest(request)) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(request);
        if (isCacheableResponse(response)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => undefined);
        }
        return response;
      })
    );
  }
});
