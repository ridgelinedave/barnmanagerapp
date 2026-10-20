import { Chip, ChipRow, EmptyState } from "@/components/ui/primitives";
import { DESKTOP_ONLY, DataTable, MOBILE_ONLY, type Row } from "@/components/ui/DataTable";
import type { Punch } from "@/lib/types";
import { flagsForPunch, FLAG_LABEL } from "@/lib/timeclock";
import { barn } from "@/config/barn";

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: barn.timezone,
});

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: barn.timezone,
});

/**
 * A person's punches, newest last, with why any of them need attention.
 *
 * Corrections are shown alongside the punch they adjust rather than replacing
 * it — the original is still in the ledger and still visible, which is the
 * whole point of an append-only record.
 *
 * Two registers: cards on a phone, a table on the desktop shell (direction,
 * day, time, flags, note — five fields is a row, not a card).
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
    return <EmptyState title={emptyLabel} />;
  }

  const rows: Row[] = punches.map((punch) => {
    const flags = flagsForPunch(punch);
    const correction = punch.source === "admin_adjustment";
    const at = new Date(punch.punched_at);
    return {
      key: punch.id,
      cells: {
        direction: punch.direction === "in" ? "In" : "Out",
        day: dayFormatter.format(at),
        time: timeFormatter.format(at),
        flags: (
          <span className="inline-flex flex-wrap gap-1.5">
            {correction && <Chip value="Correction" icon="alert" tone="gold" />}
            {!correction &&
              flags.map((flag) => <Chip key={flag} value={FLAG_LABEL[flag]} icon="alert" />)}
          </span>
        ),
        note: showNotes && punch.note ? <span className="text-muted">{punch.note}</span> : "",
      },
    };
  });

  return (
    <>
      {/* A list, so editorial rows on the ground — a rule under each, no
          card. The time is a number, so it is the condensed face. */}
      <ul className={`flex flex-col ${MOBILE_ONLY}`}>
        {punches.map((punch) => {
          const flags = flagsForPunch(punch);
          const correction = punch.source === "admin_adjustment";

          return (
            <li key={punch.id} className="border-b border-rule py-2.5">
              <div className="flex items-baseline gap-2">
                {/* Direction as a word, not just a colour — this is a pay record. */}
                <span className="w-9 font-condensed text-label font-semibold uppercase tracking-[0.06em] text-muted">
                  {punch.direction === "in" ? "In" : "Out"}
                </span>
                <span className="font-condensed text-heading font-semibold tabular-nums text-ink">
                  {timeFormatter.format(new Date(punch.punched_at))}
                </span>
              </div>

              {(correction || flags.length > 0) && (
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
            </li>
          );
        })}
      </ul>

      <div className={DESKTOP_ONLY}>
        <DataTable
          caption="Punches"
          columns={[
            { key: "direction", label: "Punch", className: "w-20" },
            { key: "day", label: "Day", className: "w-32" },
            { key: "time", label: "Time", numeric: true, className: "w-24" },
            { key: "flags", label: "Flags" },
            ...(showNotes ? [{ key: "note", label: "Note" }] : []),
          ]}
          rows={rows}
        />
      </div>
    </>
  );
}
