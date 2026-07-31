import { Card, Chip } from "@/components/ui/primitives";
import { formatBarnDayLabel } from "@/lib/dates";
import { CARE_TYPE_LABELS, type CareEvent } from "@/lib/types";

/**
 * A horse's care history, newest first (SPEC §3.4 — cards, never a table).
 *
 * The same component serves the barn and the owning family, because they see
 * the same thing: RLS returns the full history to both, and nothing at all to
 * anyone else. There is no "redacted" variant to get wrong — a family who may
 * not see this history gets an empty list, and the page says so.
 */
function DueChip({ dueNext, today }: { dueNext: string; today: string }) {
  const overdue = dueNext < today;

  return (
    <Chip
      value={`${overdue ? "Overdue" : "Due"} ${formatBarnDayLabel(dueNext)}`}
      icon={overdue ? "alert" : "clock"}
      tone={overdue ? "danger" : "gold"}
    />
  );
}

export function CareTimeline({
  events,
  today,
  loggerNames,
  emptyMessage = "Nothing logged yet.",
}: {
  events: CareEvent[];
  today: string;
  /** profiles.id → name. Barn surfaces pass this; the family view does not. */
  loggerNames?: Map<string, string>;
  emptyMessage?: string;
}) {
  if (events.length === 0) {
    return (
      <p className="rounded-card border border-line bg-surface p-4 text-caption text-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {events.map((event) => (
        <Card as="li" key={event.id} className="p-4">
          <div className="flex items-baseline gap-2">
            <h3 className="min-w-0 flex-1 font-display text-heading leading-snug text-ink">
              {CARE_TYPE_LABELS[event.type]}
            </h3>
            <span className="shrink-0 text-caption text-muted">
              {formatBarnDayLabel(event.performed_at)}
            </span>
          </div>

          {event.description && (
            <p className="mt-1 text-caption text-ink">{event.description}</p>
          )}

          {(event.due_next || (loggerNames && event.logged_by)) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {event.due_next && <DueChip dueNext={event.due_next} today={today} />}
              {loggerNames && event.logged_by && (
                <span className="text-caption text-muted">
                  Logged by {loggerNames.get(event.logged_by) ?? "the barn"}
                </span>
              )}
            </div>
          )}
        </Card>
      ))}
    </ul>
  );
}
