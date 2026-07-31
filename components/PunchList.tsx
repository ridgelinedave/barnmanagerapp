import { Card, Chip, ChipRow } from "@/components/ui/primitives";
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
      <p className="rounded-card border border-line bg-surface p-4 text-caption text-muted">
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
          <Card
            as="li"
            key={punch.id}
            className={`p-3 ${correction ? "border-gold/50 bg-gold-soft" : ""}`}
          >
            <div className="flex items-baseline gap-2">
              {/* Direction as a word, not just a colour — this is a pay record. */}
              <span className="font-display text-heading text-ink">
                {punch.direction === "in" ? "In" : "Out"}
              </span>
              <span className="text-body text-ink">
                {timeFormatter.format(new Date(punch.punched_at))}
              </span>
            </div>

            {(correction || (flags.length > 0 && !correction)) && (
              <div className="mt-1.5">
                <ChipRow>
                  {correction && <Chip value="Correction" icon="alert" tone="gold" />}
                  {!correction &&
                    flags.map((flag) => (
                      <Chip key={flag} value={FLAG_LABEL[flag]} icon="alert" tone="neutral" />
                    ))}
                </ChipRow>
              </div>
            )}

            {showNotes && punch.note && (
              <p className="mt-1.5 text-caption text-muted">{punch.note}</p>
            )}
          </Card>
        );
      })}
    </ul>
  );
}
