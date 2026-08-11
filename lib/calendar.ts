import "server-only";

import { listEventsBetween } from "@/lib/events";
import { listUpcomingInstances } from "@/lib/lessons";
import { careDueBetween } from "@/lib/care";
import { formatBarnDate } from "@/lib/dates";
import { addMonths, endOfMonth, startOfMonth } from "@/lib/month";
import { CARE_TYPE_LABELS, EVENT_TYPE_LABELS } from "@/lib/types";
import { barn } from "@/config/barn";

/**
 * The calendar — three sources flattened into one shape.
 *
 * EVERY QUERY RUNS ON THE RLS-SCOPED CLIENT, so who sees what is not decided
 * here and must never be. A parent gets their own family's lessons, the events
 * marked visible to everyone, and care due on horses they own; staff and admin
 * get the lot. That falls out of the policies written in migrations 0007, 0011
 * and 0014 — re-implementing any of it here would give those rules a second
 * home and a chance to drift.
 *
 * There is NO new SQL for this screen and none is needed: it is three existing
 * reads and a group-by.
 */
export type CalendarKind = "lesson" | "event" | "care";

export type CalendarItem = {
  id: string;
  /** Barn-local day, YYYY-MM-DD. The key everything is grouped by. */
  date: string;
  /** HH:MM:SS barn-local, or null for an all-day item like a care due date. */
  time: string | null;
  kind: CalendarKind;
  /** "Lesson", "Farrier", "Vaccine" — the small label on the row. */
  label: string;
  title: string;
  meta?: string;
  /** Where tapping the row goes, when there is somewhere useful. */
  href?: string;
};

/**
 * How wide a net to fetch.
 *
 * One month back and three forward, in one go, so paging the grid and reading
 * the agenda never refetch. For a barn this is a few hundred rows at most; the
 * alternative — a round trip per month tap — makes the arrows feel broken.
 * The arrows are disabled at the edges of this window rather than silently
 * showing an empty month.
 */
export const CALENDAR_BACK_MONTHS = 1;
export const CALENDAR_FORWARD_MONTHS = 3;

export function calendarWindow(today: string): { from: string; through: string } {
  return {
    from: startOfMonth(addMonths(today, -CALENDAR_BACK_MONTHS)),
    through: endOfMonth(addMonths(today, CALENDAR_FORWARD_MONTHS)),
  };
}

export async function loadCalendar(today: string): Promise<CalendarItem[]> {
  const { from, through } = calendarWindow(today);

  const [instances, events, care] = await Promise.all([
    listUpcomingInstances(from, through),
    listEventsBetween(from, through),
    careDueBetween(from, through),
  ]);

  const items: CalendarItem[] = [];

  for (const instance of instances) {
    if (instance.status !== "scheduled") continue;
    items.push({
      id: `lesson-${instance.id}`,
      date: instance.date,
      time: instance.start_time,
      kind: "lesson",
      label: instance.type === "group" ? "Group lesson" : "Private lesson",
      title: instance.type === "group" ? "Group lesson" : "Private lesson",
      meta: `${instance.duration_min} min`,
      href: "/lessons",
    });
  }

  for (const event of events) {
    // A timestamptz becomes a barn-local DAY here, not in SQL. An 8pm event in
    // New York is already tomorrow in UTC, and comparing the raw timestamp to a
    // date would put it on the wrong square.
    const start = new Date(event.start_at);
    // All-day is decided on the BARN's clock, not UTC. A closure set for
    // midnight in New York is 04:00 UTC, so testing the ISO string put a
    // "12:00 AM" on every all-day row instead of "All day".
    const wall = timeInBarnZone(start);
    items.push({
      id: `event-${event.id}`,
      date: formatBarnDate(start),
      time: wall === "00:00:00" ? null : wall,
      kind: "event",
      label: EVENT_TYPE_LABELS[event.type],
      title: event.title,
      meta: event.location || undefined,
    });
  }

  for (const { event, horse } of care) {
    if (!event.due_next) continue;
    items.push({
      id: `care-${event.id}`,
      date: event.due_next,
      // Care is due on a day, not at a time.
      time: null,
      kind: "care",
      label: CARE_TYPE_LABELS[event.type],
      title: horse.barn_name || horse.name,
      meta: event.description || undefined,
      href: `/manage/horses/${horse.id}`,
    });
  }

  return sortItems(items);
}

/** Barn-local wall clock from an instant, as HH:MM:SS. */
function timeInBarnZone(instant: Date): string {
  // Reuses the same formatter path as everything else that renders a time, so
  // the calendar and the lesson list can never disagree about what "4pm" is.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: barn.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}:00`;
}

/** All-day items first, then by clock. Within a tie, a stable order by kind. */
const KIND_ORDER: Record<CalendarKind, number> = { care: 0, event: 1, lesson: 2 };

export function sortItems(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? "").localeCompare(b.time ?? "") ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.title.localeCompare(b.title),
  );
}

/** date → items, for the grid's indicators and the day agenda. */
export function groupByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const list = map.get(item.date);
    if (list) list.push(item);
    else map.set(item.date, [item]);
  }
  return map;
}
