import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { KIND_ICON, KIND_TEXT } from "@/lib/calendar-kinds";
import { addBarnDays, formatTime, isoWeekday } from "@/lib/dates";
import type { CalendarItem } from "@/lib/calendar";

/**
 * A week of the barn — the desk's Schedule view. Seven columns, Monday first,
 * each day's lessons, events and care due in time order (the same items the
 * day, month and agenda views show). The day heading opens that day, where
 * the lesson controls live. Today's column is marked with the accent.
 *
 * On a phone the seven days stack — a week's agenda — because seven columns
 * do not fit a thumb's width.
 */
export function weekStart(isoDate: string): string {
  return addBarnDays(isoDate, 1 - isoWeekday(isoDate));
}

const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const numFmt = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" });
const at = (d: string) => new Date(`${d}T12:00:00Z`);

function byTime(a: CalendarItem, b: CalendarItem): number {
  // All-day items (care due) first, then by the clock.
  if (!a.time && b.time) return -1;
  if (a.time && !b.time) return 1;
  return (a.time ?? "").localeCompare(b.time ?? "");
}

function WeekItem({ item }: { item: CalendarItem }) {
  const body = (
    <>
      <span className={`flex items-center gap-1 font-condensed text-micro uppercase tracking-[0.06em] ${KIND_TEXT[item.kind]}`}>
        <Icon name={KIND_ICON[item.kind]} className="size-3 shrink-0" strokeWidth={2} />
        <span className="truncate">
          {item.time ? formatTime(item.time) : "All day"} · {item.label}
        </span>
      </span>
      <span className="block text-label font-medium leading-snug text-ink">{item.title}</span>
      {item.meta && <span className="block text-caption leading-snug text-muted">{item.meta}</span>}
    </>
  );
  const shell =
    "flex min-h-11 flex-col gap-0.5 border-b border-line py-2 last:border-b-0 lg:rounded-control lg:border lg:border-line lg:bg-surface lg:px-2 lg:py-1.5 lg:last:border-b";
  return (
    <li>
      {item.href ? (
        <Link href={item.href} className={`${shell} active:bg-sunk lg:hover:border-rule lg:hover:bg-sunk`}>
          {body}
        </Link>
      ) : (
        <div className={shell}>{body}</div>
      )}
    </li>
  );
}

export function WeekView({ start, items, today }: { start: string; items: CalendarItem[]; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addBarnDays(start, i));
  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-7 lg:gap-0 lg:overflow-hidden lg:rounded-card lg:border lg:border-rule lg:bg-ground">
      {days.map((day) => {
        const list = items.filter((i) => i.date === day).sort(byTime);
        const isToday = day === today;
        return (
          <section
            key={day}
            aria-label={new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(at(day))}
            className="flex min-w-0 flex-col lg:min-h-[30rem] lg:border-r lg:border-line lg:last:border-r-0"
          >
            <Link
              href={`/schedule?date=${day}`}
              aria-current={isToday ? "date" : undefined}
              className={`flex min-h-11 items-baseline gap-2 border-b-2 py-1.5 lg:bg-surface lg:px-3 lg:hover:bg-sunk ${
                isToday ? "border-accent" : "border-rule lg:border-line"
              }`}
            >
              <span className="font-condensed text-label font-semibold uppercase tracking-[0.08em] text-muted">{dayFmt.format(at(day))}</span>
              <span className={`font-display text-title leading-none ${isToday ? "text-accent-text" : "text-ink"}`}>{numFmt.format(at(day))}</span>
              {isToday && <span className="font-condensed text-micro font-semibold uppercase tracking-[0.08em] text-accent-text">Today</span>}
              {list.length > 0 && (
                <span className="ml-auto font-condensed text-micro tabular-nums text-muted lg:hidden">{list.length}</span>
              )}
            </Link>
            {list.length > 0 && (
              <ul className="flex flex-col lg:gap-1.5 lg:p-2">
                {list.map((item) => (
                  <WeekItem key={item.id} item={item} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
