"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/primitives";
import { formatTime } from "@/lib/dates";
import { addMonths, monthGrid, monthLabel, startOfMonth, WEEKDAY_INITIALS } from "@/lib/month";
import type { CalendarItem, CalendarKind } from "@/lib/calendar";

/**
 * The barn calendar: a month grid and an agenda, over one set of items.
 *
 * ONE ACCENT, AND IT MEANS ONE THING. Oxblood marks today, the selected day
 * and the active view — the things that answer "where am I". It is NOT used to
 * tell a lesson from a farrier visit. Categories are told apart by a small
 * LABEL and a restrained neutral tone, because a calendar where every type has
 * its own bright colour becomes a chart nobody reads, and because a barn's
 * items are mostly the same three kinds anyway.
 *
 * All the data for the whole window arrives once from the server, so paging
 * months and tapping days is instant and never refetches. The arrows stop at
 * the edges of that window rather than paging into a silently empty month.
 *
 * WHICH VIEW IS SHOWING IS NOT THIS COMPONENT'S DECISION any more. Month, day
 * and agenda are three views of one screen — the Schedule tab — and the day
 * view is server-rendered because it carries the lesson controls. So the view
 * lives in the URL and the switcher lives on the page; this component renders
 * the one it is handed. It used to own a month/agenda toggle and remember it in
 * a cookie, which would now be a second switcher fighting the first.
 */
export type CalendarView = "month" | "list";

const KIND_ICON: Record<CalendarKind, IconName> = {
  lesson: "calendar",
  event: "pin",
  care: "alert",
};

/** Neutral tones. Deliberately close together — this is not a key. */
const KIND_TONE: Record<CalendarKind, string> = {
  lesson: "bg-sunk text-ink",
  event: "bg-accent-tint text-accent-text",
  care: "bg-danger-soft text-danger",
};

function ItemRow({ item }: { item: CalendarItem }) {
  const body = (
    <>
      {/* The time column is fixed-width so a day's rows line up on the clock,
          and all-day items sit in the same gutter rather than shunting left. */}
      <span className="w-14 shrink-0 pt-0.5 text-caption tabular-nums text-muted">
        {item.time ? formatTime(item.time) : "All day"}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-display text-heading leading-snug text-ink">{item.title}</span>
        {item.meta && <span className="mt-0.5 block text-caption text-muted">{item.meta}</span>}
      </span>

      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-[0.375rem] px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.06em] ${KIND_TONE[item.kind]}`}
      >
        <Icon name={KIND_ICON[item.kind]} className="size-3" strokeWidth={2} />
        {item.label}
      </span>
    </>
  );

  const shell = "flex items-start gap-3 border-b border-line py-3 last:border-b-0";

  if (!item.href) return <li className={shell}>{body}</li>;
  return (
    <li>
      <Link href={item.href} className={`${shell} active:bg-sunk`}>
        {body}
      </Link>
    </li>
  );
}

function DayAgenda({ date, items, today }: { date: string; items: CalendarItem[]; today: string }) {
  const label = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-heading text-ink">{label}</h2>
        {date === today && (
          <span className="rounded-[0.375rem] bg-accent px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-accent-on">
            Today
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-caption text-muted">Nothing on this day.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function Calendar({
  items,
  today,
  view,
  windowFrom,
  windowThrough,
}: {
  items: CalendarItem[];
  today: string;
  view: CalendarView;
  windowFrom: string;
  windowThrough: string;
}) {
  const [month, setMonth] = useState(() => startOfMonth(today));
  const [selected, setSelected] = useState<string | null>(today);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const list = map.get(item.date);
      if (list) list.push(item);
      else map.set(item.date, [item]);
    }
    return map;
  }, [items]);

  const grid = useMemo(() => monthGrid(month), [month]);

  const canPrev = startOfMonth(addMonths(month, -1)) >= startOfMonth(windowFrom);
  const canNext = startOfMonth(addMonths(month, 1)) <= startOfMonth(windowThrough);

  const upcoming = useMemo(
    () => items.filter((item) => item.date >= today),
    [items, today],
  );
  const upcomingDays = useMemo(() => {
    const days: { date: string; items: CalendarItem[] }[] = [];
    for (const item of upcoming) {
      const last = days[days.length - 1];
      if (last && last.date === item.date) last.items.push(item);
      else days.push({ date: item.date, items: [item] });
    }
    return days;
  }, [upcoming]);

  return (
    <>
      {view === "month" ? (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, -1))}
              disabled={!canPrev}
              aria-label="Previous month"
              className="flex size-11 items-center justify-center rounded-control border border-line text-ink disabled:opacity-30"
            >
              <Icon name="chevron" className="size-4 rotate-180" strokeWidth={2} />
            </button>

            <h2 className="flex-1 text-center font-display text-title text-ink">
              {monthLabel(month)}
            </h2>

            <button
              type="button"
              onClick={() => setMonth(addMonths(month, 1))}
              disabled={!canNext}
              aria-label="Next month"
              className="flex size-11 items-center justify-center rounded-control border border-line text-ink disabled:opacity-30"
            >
              <Icon name="chevron" className="size-4" strokeWidth={2} />
            </button>
          </div>

          <div>
            {/* Weekday header. aria-hidden because the day buttons below each
                carry their own full date label for a screen reader. */}
            <div aria-hidden="true" className="grid grid-cols-7 pb-1">
              {WEEKDAY_INITIALS.map((initial, i) => (
                <span
                  key={i}
                  className="text-center text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted"
                >
                  {initial}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-card border border-line bg-line">
              {grid.map((cell) => {
                const dayItems = byDay.get(cell.iso) ?? [];
                const isToday = cell.iso === today;
                const isSelected = cell.iso === selected;

                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => setSelected(cell.iso)}
                    aria-label={new Intl.DateTimeFormat("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    }).format(new Date(`${cell.iso}T12:00:00Z`))}
                    aria-current={isToday ? "date" : undefined}
                    aria-pressed={isSelected}
                    className={`flex min-h-13 flex-col items-center justify-start gap-1 bg-surface px-1 pt-1.5 pb-1 ${
                      isSelected ? "bg-accent-tint" : ""
                    }`}
                  >
                    <span
                      className={`flex size-6 items-center justify-center rounded-full text-caption tabular-nums ${
                        isToday
                          ? "bg-accent font-bold text-accent-on"
                          : cell.inMonth
                            ? "text-ink"
                            : // NOT muted/50 — that measured 2.18:1 and a date
                              // you cannot read is a date you cannot tap with
                              // confidence. Full `muted` is 6.34:1 and still
                              // clearly recedes behind `ink`.
                              "text-muted"
                      }`}
                    >
                      {Number(cell.iso.slice(8, 10))}
                    </span>

                    {/* Up to three dots, then a count. A dot per item turns a
                        busy Saturday into a grey smear. */}
                    {dayItems.length > 0 && (
                      <span aria-hidden="true" className="flex items-center gap-0.5">
                        {dayItems.slice(0, 3).map((item) => (
                          <span
                            key={item.id}
                            className={`size-1 rounded-full ${
                              item.kind === "care" ? "bg-danger" : "bg-accent"
                            }`}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {selected && (
            <DayAgenda date={selected} items={byDay.get(selected) ?? []} today={today} />
          )}
        </>
      ) : (
        <>
          {upcomingDays.length === 0 ? (
            <EmptyState
              title="Nothing coming up"
              body="Lessons, barn events and care due dates land here."
            />
          ) : (
            upcomingDays.map((day) => (
              <DayAgenda key={day.date} date={day.date} items={day.items} today={today} />
            ))
          )}
        </>
      )}
    </>
  );
}
