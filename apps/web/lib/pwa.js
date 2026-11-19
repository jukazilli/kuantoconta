export const PWA_CACHE_PREFIX = "kc-static-";
export const PWA_CACHE_VERSION = "kc-static-v1";
export const PWA_OFFLINE_URL = "/offline";

// Security boundary (docs/03-architecture/SECURITY.md):
// Financial API responses, auth routes, OAuth flows, and authenticated app HTML/RSC
// must NEVER be persisted in PWA Cache Storage.
export const FORBIDDEN_CACHE_PREFIXES = [
  "/api/",
  "/auth/",
  "/oauth/",
  "/.well-known/",
  "/dashboard",
  "/legal/accept",
];

export const CACHEABLE_STATIC_PREFIXES = [
  "/_next/static/",
  "/icons/",
  "/banks/",
];

function getHeader(headers, name) {
  if (!headers) return "";
  const target = name.toLowerCase();
  if (typeof headers.get === "function") {
    return String(headers.get(name) || headers.get(target) || "");
  }
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) return String(v || "");
  }
  return "";
}

/**
 * Pure cache-eligibility predicate mirroring public/sw.js.
 * Returns true ONLY for same-origin GET requests to immutable/public static assets
 * or the public /offline shell.
 */
export function shouldCacheRequest({
  method = "GET",
  url = "",
  origin = "",
  mode = "",
  headers = null,
} = {}) {
  if (String(method).toUpperCase() !== "GET") return false;
  if (!url) return false;

  let parsed;
  try {
    parsed = new URL(url, origin || "https://localhost");
  } catch {
    return false;
  }

  if (origin && parsed.origin !== origin) return false;
  if (parsed.searchParams.has("_rsc")) return false;
  if (getHeader(headers, "rsc") === "1") return false;
  if (getHeader(headers, "next-router-prefetch") === "1") return false;
  if (mode === "navigate") return false;

  const { pathname } = parsed;
  if (pathname === PWA_OFFLINE_URL) return true;

  for (const forbidden of FORBIDDEN_CACHE_PREFIXES) {
    if (pathname === forbidden || pathname.startsWith(forbidden)) return false;
  }

  return CACHEABLE_STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Validates that a network response is safe to store in public static Cache Storage.
 */
export function shouldCacheResponse({ status = 0, type = "basic", headers = null } = {}) {
  if (status !== 200) return false;
  if (type !== "basic") return false;

  const cacheControl = getHeader(headers, "cache-control").toLowerCase();
  if (cacheControl.includes("no-store") || cacheControl.includes("private")) return false;
  if (getHeader(headers, "set-cookie")) return false;

  return true;
}

export function isStandaloneDisplayMode(win) {
  if (!win) return false;
  try {
    if (typeof win.matchMedia === "function" && win.matchMedia("(display-mode: standalone)").matches) {
      return true;
    }
    if (win.navigator && win.navigator.standalone === true) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function detectInstallPlatform(userAgent = "", maxTouchPoints = 0) {
  const ua = String(userAgent || "");
  if (!ua) return "unknown";

  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isIPadOS = /Macintosh/i.test(ua) && Number(maxTouchPoints) > 1;
  if (isIOS || isIPadOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return "desktop";
  return "unknown";
}

export function canRegisterServiceWorker(win) {
  if (!win || !win.navigator || !("serviceWorker" in win.navigator)) return false;
  if (win.isSecureContext === true) return true;
  const host = win.location?.hostname || "";
  return host === "localhost" || host === "127.0.0.1";
}

export async function clearPwaCaches(cachesApi) {
  if (!cachesApi || typeof cachesApi.keys !== "function") return 0;
  const keys = await cachesApi.keys();
  const targets = keys.filter((key) => key.startsWith(PWA_CACHE_PREFIX));
  await Promise.all(targets.map((key) => cachesApi.delete(key)));
  return targets.length;
}
