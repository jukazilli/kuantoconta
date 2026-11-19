"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import {
  canRegisterServiceWorker,
  clearPwaCaches,
  detectInstallPlatform,
  isStandaloneDisplayMode,
} from "../../lib/pwa";

const PwaContext = createContext({
  isStandalone: false,
  isOnline: true,
  canInstall: false,
  platform: "unknown",
  installState: "idle",
  updateAvailable: false,
  promptInstall: async () => ({ outcome: "unavailable" }),
  applyUpdate: () => {},
  clearCachesOnSignOut: async () => {},
});

export function usePwa() {
  return useContext(PwaContext);
}

export default function PwaProvider({ children }) {
  const [isStandalone, setIsStandalone] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [platform, setPlatform] = useState("unknown");
  const [canInstall, setCanInstall] = useState(false);
  const [installState, setInstallState] = useState("idle"); // idle | prompting | accepted | dismissed | installed
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const deferredPromptRef = useRef(null);
  const waitingWorkerRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone = isStandaloneDisplayMode(window);
    setIsStandalone(standalone);
    if (standalone) setInstallState("installed");

    setIsOnline(window.navigator.onLine !== false);
    setPlatform(detectInstallPlatform(window.navigator.userAgent, window.navigator.maxTouchPoints));

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      deferredPromptRef.current = event;
      window.__kcDeferredInstallPrompt = event;
      setCanInstall(true);
    };

    const handleEarlyInstallReady = () => {
      if (window.__kcDeferredInstallPrompt) {
        deferredPromptRef.current = window.__kcDeferredInstallPrompt;
        setCanInstall(true);
      }
    };

    // Pick up any beforeinstallprompt captured before React hydration
    if (window.__kcDeferredInstallPrompt) {
      deferredPromptRef.current = window.__kcDeferredInstallPrompt;
      setCanInstall(true);
    }

    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      window.__kcDeferredInstallPrompt = null;
      setCanInstall(false);
      setIsStandalone(true);
      setInstallState("installed");
    };

    const mediaQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(display-mode: standalone)")
        : null;
    const handleDisplayModeChange = (e) => {
      if (e.matches) {
        setIsStandalone(true);
        setInstallState("installed");
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("kc-install-ready", handleEarlyInstallReady);
    window.addEventListener("appinstalled", handleAppInstalled);
    mediaQuery?.addEventListener?.("change", handleDisplayModeChange);

    let reloading = false;
    const handleControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    if (canRegisterServiceWorker(window)) {
      window.navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

      window.navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => {
          if (registration.waiting) {
            waitingWorkerRef.current = registration.waiting;
            setUpdateAvailable(true);
          }

          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed" && window.navigator.serviceWorker.controller) {
                waitingWorkerRef.current = installing;
                setUpdateAvailable(true);
              }
            });
          });
        })
        .catch(() => {
          // Silent fallback: app continues functioning normally without SW.
        });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("kc-install-ready", handleEarlyInstallReady);
      window.removeEventListener("appinstalled", handleAppInstalled);
      mediaQuery?.removeEventListener?.("change", handleDisplayModeChange);
      window.navigator?.serviceWorker?.removeEventListener?.("controllerchange", handleControllerChange);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const promptEvent = deferredPromptRef.current || (typeof window !== "undefined" ? window.__kcDeferredInstallPrompt : null);
    if (!promptEvent) return { outcome: "unavailable" };

    setInstallState("prompting");
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      deferredPromptRef.current = null;
      if (typeof window !== "undefined") window.__kcDeferredInstallPrompt = null;
      setCanInstall(false);
      if (choice?.outcome === "accepted") {
        setInstallState("accepted");
        return { outcome: "accepted" };
      }
      setInstallState("dismissed");
      return { outcome: "dismissed" };
    } catch {
      setInstallState("idle");
      return { outcome: "error" };
    }
  }, []);

  const applyUpdate = useCallback(() => {
    const waiting = waitingWorkerRef.current;
    if (waiting) {
      waiting.postMessage({ type: "SKIP_WAITING" });
    } else if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, []);

  const clearCachesOnSignOut = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      window.navigator?.serviceWorker?.controller?.postMessage({ type: "CLEAR_CACHES" });
      if ("caches" in window) {
        await clearPwaCaches(window.caches);
      }
    } catch {
      // Ignore cleanup errors during sign-out redirect
    }
  }, []);

  const value = useMemo(
    () => ({
      isStandalone,
      isOnline,
      canInstall,
      platform,
      installState,
      updateAvailable,
      promptInstall,
      applyUpdate,
      clearCachesOnSignOut,
    }),
    [isStandalone, isOnline, canInstall, platform, installState, updateAvailable, promptInstall, applyUpdate, clearCachesOnSignOut]
  );

  return (
    <PwaContext.Provider value={value}>
      {children}

      {!isOnline && (
        <div className="pwa-banner pwa-banner-offline" role="status" aria-live="polite">
          <WifiOff size={15} aria-hidden="true" />
          <span>Sem conexão. Reconecte-se para atualizar seus dados.</span>
        </div>
      )}

      {updateAvailable && isOnline && (
        <div className="pwa-banner pwa-banner-update" role="status" aria-live="polite">
          <span>Nova versão do kuantoconta disponível.</span>
          <button type="button" className="pwa-banner-btn" onClick={applyUpdate}>
            <RefreshCw size={14} aria-hidden="true" />
            Atualizar
          </button>
        </div>
      )}
    </PwaContext.Provider>
  );
}
