"use client";

import { useEffect } from "react";
import { markBooted } from "@/lib/boot";

/**
 * Renders nothing; records that the app shell has mounted.
 *
 * It sits in the app layout, which mounts once per document and survives every
 * client-side navigation — so its effect fires exactly once, at the end of the
 * cold load, and from then on `hasBooted()` is true for the life of the tab.
 *
 * The ordering that makes this work: React runs render before effects. On a
 * cold load the loading fallback renders (and reads `hasBooted()` as false)
 * before this component's effect commits, so the launch screen still shows on
 * the very first paint it was written for.
 */
export function BootMarker() {
  useEffect(() => {
    markBooted();
  }, []);

  return null;
}
