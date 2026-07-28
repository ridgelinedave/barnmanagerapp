"use client";

import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { barn } from "@/config/barn";

/** Install-to-home-screen card. Renders nothing unless an install is possible. */
export function InstallPrompt() {
  const { canPrompt, isStandalone, isIos, promptInstall, dismiss } = useInstallPrompt();

  if (isStandalone) return null;

  // iOS Safari gives no programmatic prompt — tell the user the manual steps.
  if (isIos) {
    return (
      <section className="rounded-2xl border border-brand-gold/40 bg-white p-4">
        <h2 className="text-base font-semibold">{barn.pwa.installTitle}</h2>
        <p className="mt-1 text-sm text-brand-ink/70">
          In Safari, tap Share, then <span className="font-medium">Add to Home Screen</span>.
        </p>
      </section>
    );
  }

  if (!canPrompt) return null;

  return (
    <section className="rounded-2xl border border-brand-gold/40 bg-white p-4">
      <h2 className="text-base font-semibold">{barn.pwa.installTitle}</h2>
      <p className="mt-1 text-sm text-brand-ink/70">{barn.pwa.installBody}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void promptInstall()}
          className="min-h-11 flex-1 rounded-xl bg-brand-gold px-4 text-sm font-semibold text-white"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="min-h-11 rounded-xl border border-brand-ink/20 px-4 text-sm font-medium"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
