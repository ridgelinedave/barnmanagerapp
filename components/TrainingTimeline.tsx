import { Chip, ChipRow } from "@/components/ui/primitives";
import { formatBarnDayLabel } from "@/lib/dates";
import { DISCIPLINE_LABELS, type TrainingLog } from "@/lib/types";

/**
 * A horse's training history, newest first.
 *
 * The same component serves the barn and the owning family, because they see
 * the same thing: RLS returns the full history to both and nothing at all to
 * anyone else. There is no "redacted" variant to get wrong — a family who may
 * not see this history gets an empty list, and the screen says so.
 *
 * Editorial rows with a hairline between them rather than a stack of cards.
 * Six boxed cards down a phone is six competing rectangles; the date is the
 * spine and everything else hangs off it.
 */
export function TrainingTimeline({
  logs,
  loggerNames,
  emptyMessage = "Nothing logged yet.",
}: {
  logs: TrainingLog[];
  /** profiles.id → name. Barn surfaces pass this; the family view does not. */
  loggerNames?: Map<string, string>;
  emptyMessage?: string;
}) {
  if (logs.length === 0) {
    return (
      <p className="rounded-card border border-line bg-surface p-4 text-caption text-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="rounded-card border border-line bg-surface">
      {logs.map((log) => {
        const by = log.logged_by ? loggerNames?.get(log.logged_by) : null;

        return (
          <li key={log.id} className="border-b border-line p-4 last:border-b-0">
            <div className="flex items-baseline gap-3">
              <h3 className="min-w-0 flex-1 font-display text-heading leading-snug text-ink">
                {DISCIPLINE_LABELS[log.discipline]}
              </h3>
              <p className="shrink-0 text-caption text-muted">
                {formatBarnDayLabel(log.performed_at)}
              </p>
            </div>

            {log.focus && <p className="mt-1 text-caption text-ink">{log.focus}</p>}

            {log.duration_min !== null && (
              <div className="mt-1.5">
                <ChipRow>
                  <Chip value={`${log.duration_min} min`} icon="clock" />
                </ChipRow>
              </div>
            )}

            {log.notes && <p className="mt-2 text-caption text-muted">{log.notes}</p>}

            {/* Attribution only where it is known. The family view does not pass
                names, so a boarder sees the work and not the roster. */}
            {by && <p className="mt-2 text-caption text-muted">Logged by {by}</p>}
          </li>
        );
      })}
    </ul>
  );
}
