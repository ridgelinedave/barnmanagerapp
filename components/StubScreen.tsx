import type { ReactNode } from "react";

/**
 * Phase 0 placeholder body for a tab that has no feature behind it yet.
 *
 * This is scaffolding, not shipped copy. Every one of these is replaced by a
 * real screen in Phases 1–3 — nothing here may reach a live barn (SPEC §12,
 * "a live site carries zero placeholder").
 */
export function StubScreen({
  heading,
  phase,
  children,
}: {
  heading: string;
  /** Which build phase fills this tab in. */
  phase: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-brand-ink/25 bg-white p-5">
      <h2 className="text-base font-semibold">{heading}</h2>
      <p className="mt-1 text-sm text-brand-ink/70">
        Nothing here yet — this tab is built in {phase}.
      </p>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
