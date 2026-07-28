"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** The non-standard Chromium event that lets us defer the install prompt. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "install-prompt-dismissed";

/*
 * Browser facts (standalone mode, platform, the dismissed flag) are read via
 * useSyncExternalStore rather than "set state in an effect". That keeps SSR
 * honest — each store declares a server snapshot — and avoids the cascading
 * render an effect-then-setState pair would cause.
 */

const STANDALONE_QUERY = "(display-mode: standalone)";

function subscribeStandalone(onChange: () => void) {
  const query = window.matchMedia(STANDALONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getStandalone() {
  return (
    window.matchMedia(STANDALONE_QUERY).matches ||
    // iOS Safari exposes this instead of display-mode.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const neverChanges = () => () => {};

function getIsIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/** Tiny store over localStorage so dismissing re-renders every consumer. */
const dismissedListeners = new Set<() => void>();

function subscribeDismissed(onChange: () => void) {
  dismissedListeners.add(onChange);
  return () => {
    dismissedListeners.delete(onChange);
  };
}

function getDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // Private mode — treat as not dismissed; the card reappears next visit.
    return false;
  }
}

function markDismissed() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Ignored — dismissal simply does not persist.
  }
  for (const listener of dismissedListeners) listener();
}

const serverFalse = () => false;

export type InstallPromptState = {
  /** Show an install affordance (Chromium captured the event, not yet installed). */
  canPrompt: boolean;
  /** Already running as an installed PWA. */
  isStandalone: boolean;
  /** iOS Safari never fires the event — it needs the manual Share → Add flow. */
  isIos: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  dismiss: () => void;
};

export function useInstallPrompt(): InstallPromptState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  const matchesStandalone = useSyncExternalStore(subscribeStandalone, getStandalone, serverFalse);
  const isIos = useSyncExternalStore(neverChanges, getIsIos, serverFalse);
  const dismissed = useSyncExternalStore(subscribeDismissed, getDismissed, serverFalse);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return "unavailable" as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome;
  }, [deferred]);

  const dismiss = useCallback(() => {
    markDismissed();
  }, []);

  const isStandalone = matchesStandalone || installed;

  return {
    canPrompt: Boolean(deferred) && !isStandalone && !dismissed,
    isStandalone,
    isIos,
    promptInstall,
    dismiss,
  };
}
