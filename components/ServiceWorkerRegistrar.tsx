"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker.
 *
 * Production only — a caching service worker in dev makes edits look like they
 * did not apply. Any stale registration from a previous run is unregistered so
 * dev never serves cached HTML.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) registration.unregister();
      });
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failure is non-fatal — the app works without offline support.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
