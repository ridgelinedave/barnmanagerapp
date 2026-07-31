"use client";

import { Callout } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { barn } from "@/config/barn";

/** Install-to-home-screen prompt. Renders nothing unless an install is possible. */
export function InstallPrompt() {
  const { canPrompt, isStandalone, isIos, promptInstall, dismiss } = useInstallPrompt();

  if (isStandalone) return null;

  // iOS Safari gives no programmatic prompt — tell the person the manual steps
  // rather than showing a button that cannot work.
  if (isIos) {
    return (
      <Callout tone="gold" icon="plus">
        <p className="font-display text-heading text-ink">{barn.pwa.installTitle}</p>
        <p className="mt-0.5">
          In Safari, tap Share, then <span className="font-semibold">Add to Home Screen</span>.
        </p>
      </Callout>
    );
  }

  if (!canPrompt) return null;

  return (
    <Callout tone="gold" icon="plus">
      <p className="font-display text-heading text-ink">{barn.pwa.installTitle}</p>
      <p className="mt-0.5">{barn.pwa.installBody}</p>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" onClick={() => void promptInstall()} className="flex-1">
          Install
        </Button>
        <Button variant="ghost" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </Callout>
  );
}
