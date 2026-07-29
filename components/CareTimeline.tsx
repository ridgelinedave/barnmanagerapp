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
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        overdue ? "bg-red-100 text-red-900" : "bg-brand-gold/30 text-brand-ink"
      }`}
    >
      {overdue ? "Overdue" : "Due"} {formatBarnDayLabel(dueNext)}
    </span>
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
      <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {events.map((event) => (
        <li key={event.id} className="rounded-2xl border border-brand-ink/15 bg-white p-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="text-base font-semibold leading-snug">
              {CARE_TYPE_LABELS[event.type]}
            </h3>
            <span className="text-sm text-brand-ink/60">
              {formatBarnDayLabel(event.performed_at)}
            </span>
          </div>

          {event.description && (
            <p className="mt-1 text-sm text-brand-ink/85">{event.description}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {event.due_next && <DueChip dueNext={event.due_next} today={today} />}
            {loggerNames && event.logged_by && (
              <span className="text-xs text-brand-ink/55">
                Logged by {loggerNames.get(event.logged_by) ?? "the barn"}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
