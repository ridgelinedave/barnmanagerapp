import type { Punch } from "@/lib/types";
import { flagsForPunch, FLAG_LABEL } from "@/lib/timeclock";
import { barn } from "@/config/barn";

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: barn.timezone,
});

/**
 * A person's punches, newest last, with why any of them need attention.
 *
 * Corrections are shown alongside the punch they adjust rather than replacing
 * it — the original is still in the ledger and still visible, which is the
 * whole point of an append-only record.
 */
export function PunchList({
  punches,
  emptyLabel = "No punches.",
  showNotes = true,
}: {
  punches: Punch[];
  emptyLabel?: string;
  showNotes?: boolean;
}) {
  if (punches.length === 0) {
    return (
      <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {punches.map((punch) => {
        const flags = flagsForPunch(punch);
        const correction = punch.source === "admin_adjustment";

        return (
          <li
            key={punch.id}
            className={`rounded-2xl border p-3 ${
              correction ? "border-brand-gold/50 bg-brand-gold/5" : "border-brand-ink/10 bg-white"
            }`}
          >
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-base font-semibold">
                {punch.direction === "in" ? "In" : "Out"}
              </span>
              <span className="tabular-nums text-brand-ink/80">
                {timeFormatter.format(new Date(punch.punched_at))}
              </span>
              {correction && (
                <span className="ml-auto rounded-full bg-brand-gold/40 px-2 py-0.5 text-[11px] font-semibold text-brand-ink">
                  Correction
                </span>
              )}
            </div>

            {flags.length > 0 && !correction && (
              <p className="mt-1 flex flex-wrap gap-1">
                {flags.map((flag) => (
                  <span
                    key={flag}
                    className="rounded-full bg-brand-ink/10 px-2 py-0.5 text-[11px] font-semibold text-brand-ink/70"
                  >
                    {FLAG_LABEL[flag]}
                  </span>
                ))}
              </p>
            )}

            {showNotes && punch.note && (
              <p className="mt-1 text-sm text-brand-ink/70">{punch.note}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
