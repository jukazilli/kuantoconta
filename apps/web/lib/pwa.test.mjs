import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import manifest from "../app/manifest.js";
import nextConfig from "../next.config.mjs";
import {
  PWA_CACHE_PREFIX,
  canRegisterServiceWorker,
  clearPwaCaches,
  detectInstallPlatform,
  isStandaloneDisplayMode,
  shouldCacheRequest,
  shouldCacheResponse,
} from "./pwa.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

test("PWA manifest meets installability criteria and all declared PNG icons exist", () => {
  const m = manifest();
  assert.equal(m.short_name, "kuantoconta");
  assert.equal(m.display, "standalone");
  assert.equal(m.scope, "/");
  assert.ok(m.start_url.startsWith("/dashboard"));
  assert.ok(Array.isArray(m.icons) && m.icons.length >= 4);

  const has192 = m.icons.some((i) => i.sizes === "192x192" && i.purpose === "any");
  const has512 = m.icons.some((i) => i.sizes === "512x512" && i.purpose === "any");
  const hasMaskable512 = m.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable");
  assert.equal(has192, true);
  assert.equal(has512, true);
  assert.equal(hasMaskable512, true);

  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  for (const icon of m.icons) {
    const filePath = path.join(webRoot, "public", icon.src.replace(/^\//, ""));
    assert.ok(fs.existsSync(filePath), `Missing icon file: ${icon.src}`);
    const head = fs.readFileSync(filePath).subarray(0, 8);
    assert.deepEqual(head, PNG_SIG, `Invalid PNG header for ${icon.src}`);
  }

  const appleIcon = path.join(webRoot, "public/icons/apple-touch-icon.png");
  assert.ok(fs.existsSync(appleIcon), "Missing apple-touch-icon.png");
});

test("PWA cache policy strictly blocks all financial, auth, OAuth, and authenticated HTML/RSC requests", () => {
  const origin = "https://kuantoconta.app";
  const blockedUrls = [
    "/api/portfolio",
    "/api/auth/session",
    "/api/oauth/token",
    "/api/mcp",
    "/api/legal/accept",
    "/auth/sign-in",
    "/oauth/authorize",
    "/.well-known/oauth-protected-resource",
    "/dashboard",
    "/dashboard?source=pwa",
    "/legal/accept",
    "/_next/static/chunk.js?_rsc=abc",
  ];

  for (const u of blockedUrls) {
    assert.equal(
      shouldCacheRequest({ method: "GET", url: `${origin}${u}`, origin }),
      false,
      `Expected ${u} to NEVER be cached`
    );
  }

  // Non-GET, cross-origin, navigation, and RSC headers are blocked
  assert.equal(shouldCacheRequest({ method: "POST", url: `${origin}/icons/icon-192.png`, origin }), false);
  assert.equal(shouldCacheRequest({ method: "GET", url: "https://evil.example/icons/icon-192.png", origin }), false);
  assert.equal(shouldCacheRequest({ method: "GET", url: `${origin}/offline`, origin, mode: "navigate" }), false);
  assert.equal(
    shouldCacheRequest({ method: "GET", url: `${origin}/_next/static/app.js`, origin, headers: { rsc: "1" } }),
    false
  );

  // Public static assets & /offline shell are allowed
  assert.equal(shouldCacheRequest({ method: "GET", url: `${origin}/_next/static/chunks/main.js`, origin }), true);
  assert.equal(shouldCacheRequest({ method: "GET", url: `${origin}/icons/icon-192.png`, origin }), true);
  assert.equal(shouldCacheRequest({ method: "GET", url: `${origin}/banks/nubank.svg`, origin }), true);
  assert.equal(shouldCacheRequest({ method: "GET", url: `${origin}/offline`, origin }), true);
});

test("PWA response policy rejects private, no-store, Set-Cookie, and non-200 responses", () => {
  assert.equal(shouldCacheResponse({ status: 200, type: "basic", headers: { "cache-control": "public, max-age=31536000, immutable" } }), true);
  assert.equal(shouldCacheResponse({ status: 200, type: "basic", headers: { "cache-control": "private, no-store" } }), false);
  assert.equal(shouldCacheResponse({ status: 200, type: "basic", headers: { "cache-control": "no-store" } }), false);
  assert.equal(shouldCacheResponse({ status: 200, type: "basic", headers: { "set-cookie": "session=abc" } }), false);
  assert.equal(shouldCacheResponse({ status: 200, type: "opaque", headers: {} }), false);
  assert.equal(shouldCacheResponse({ status: 401, type: "basic", headers: {} }), false);
});

test("Service worker file and Next.js headers enforce security & fresh SW updates", async () => {
  const swSource = fs.readFileSync(path.join(webRoot, "public/sw.js"), "utf8");
  assert.ok(swSource.includes('"/api/"'), "sw.js must explicitly exclude /api/");
  assert.ok(swSource.includes('"/auth/"'), "sw.js must explicitly exclude /auth/");
  assert.ok(swSource.includes('"/oauth/"'), "sw.js must explicitly exclude /oauth/");
  assert.ok(swSource.includes('"/dashboard"'), "sw.js must explicitly exclude /dashboard");
  assert.ok(swSource.includes("no-store"), "sw.js must respect no-store");
  assert.ok(swSource.includes("private"), "sw.js must respect private");
  assert.ok(swSource.includes("set-cookie"), "sw.js must reject responses with Set-Cookie");

  const headerRules = await nextConfig.headers();
  const swRule = headerRules.find((r) => r.source === "/sw.js");
  assert.ok(swRule, "next.config.mjs must define headers for /sw.js");
  const swCache = swRule.headers.find((h) => h.key.toLowerCase() === "cache-control");
  assert.ok(swCache && swCache.value.includes("no-cache") && swCache.value.includes("no-store"));
});

test("Platform detection, standalone detection, SW registration guard, and cache cleanup work as expected", async () => {
  assert.equal(detectInstallPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5), "ios");
  assert.equal(detectInstallPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), "ios");
  assert.equal(detectInstallPlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9)", 5), "android");
  assert.equal(detectInstallPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0), "desktop");

  assert.equal(
    isStandaloneDisplayMode({ matchMedia: () => ({ matches: true }), navigator: {} }),
    true
  );
  assert.equal(
    isStandaloneDisplayMode({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } }),
    true
  );
  assert.equal(
    isStandaloneDisplayMode({ matchMedia: () => ({ matches: false }), navigator: { standalone: false } }),
    false
  );

  assert.equal(canRegisterServiceWorker({ isSecureContext: true, navigator: { serviceWorker: {} } }), true);
  assert.equal(canRegisterServiceWorker({ isSecureContext: false, location: { hostname: "localhost" }, navigator: { serviceWorker: {} } }), true);
  assert.equal(canRegisterServiceWorker({ isSecureContext: false, location: { hostname: "example.com" }, navigator: { serviceWorker: {} } }), false);

  const deleted = [];
  const count = await clearPwaCaches({
    keys: async () => [`${PWA_CACHE_PREFIX}v1`, "other-cache"],
    delete: async (k) => {
      deleted.push(k);
      return true;
    },
  });
  assert.equal(count, 1);
  assert.deepEqual(deleted, [`${PWA_CACHE_PREFIX}v1`]);
});
