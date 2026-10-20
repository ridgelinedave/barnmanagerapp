"use client";

import { useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/primitives";
import { BOARD_MEALS, BOARD_MEAL_LABELS, type BoardNote, type BoardRow } from "@/lib/feed-board";
import type { Meal } from "@/lib/types";

/**
 * The feed board as a whiteboard (design/FEED-BOARD-WHITEBOARD-PROPOSAL.md and
 * the 2026-10-20 addendum). It replaces a physical board in the aisle.
 *
 * WALL (>= 768px): rows are horses, columns are meals. The meal happening now
 * sits on white (paper); the others recede onto the blush ground in muted
 * ink. White on blush is ~1.15:1 — deliberately: it separates two SURFACES and
 * carries no information alone, because the current column's header also says
 * "now" in words. Loudness is never colour alone.
 *
 * PHONE (320-767px): one meal at a time, a three-way segmented control that
 * opens on the current meal.
 *
 * A HORSE WITH NO CHART FOR A MEAL (decided 2026-10-20):
 *   - on the WALL grid it shows an em dash, because the grid's job is
 *     completeness and a gap reads as a mistake;
 *   - on the PHONE view it is HIDDEN, because that view's job is "what goes
 *     in a bucket right now", and a list of nothings is noise.
 *
 * No photo circle on this screen, even once uploads exist: on a whiteboard the
 * name is the key and the width belongs to the feed. Tapping a horse opens
 * its full chart, as before.
 */
const chartHref = (horseId: string) => `/tasks/feed/${horseId}`;

function CareBand({ note, tight = false }: { note: BoardNote; tight?: boolean }) {
  return (
    <p
      className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-l-[3px] border-gold bg-gold-tint ${
        tight ? "px-3 py-1.5" : "px-4 py-2"
      }`}
    >
      {/* goldDeep on goldTint, 5.45:1. */}
      <span className="font-condensed text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-gold-deep">
        {note.label}
      </span>
      {/* charcoalText on goldTint, 7.12:1. */}
      <span className="min-w-0 font-sans text-[0.875rem] text-charcoal-text">{note.detail}</span>
    </p>
  );
}

function Items({ items }: { items: string[] }) {
  if (items.length === 0) {
    return (
      <span className="text-muted" aria-label="Nothing this meal">
        —
      </span>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function WallBoard({ rows, now }: { rows: BoardRow[]; now: Meal }) {
  const grid = "grid grid-cols-[236px_repeat(3,minmax(0,1fr))]";

  return (
    <div className="hidden md:flex md:flex-col">
      <div role="table" aria-label="Feed board">
        <div role="row" className={`${grid} border-b border-accent-text`}>
          <span role="columnheader" className="sr-only">
            Horse
          </span>
          {BOARD_MEALS.map((meal) => (
            <span
              key={meal}
              role="columnheader"
              className={`py-2 pl-4 font-condensed text-[0.8125rem] uppercase tracking-[0.26em] ${
                meal === now ? "font-semibold text-accent-text" : "font-medium text-muted"
              } ${meal === "am" ? "col-start-2" : ""}`}
            >
              {BOARD_MEAL_LABELS[meal]}
              {meal === now ? " · now" : ""}
            </span>
          ))}
        </div>

        {rows.map((row) => {
          const notes = row.notes;
          return (
            <div key={row.horseId} className="border-b border-line">
              <div role="row" className={grid}>
                <div role="rowheader" className="py-4 pr-4">
                  <Link
                    href={chartHref(row.horseId)}
                    className="block min-h-11 rounded-control lg:hover:underline lg:hover:underline-offset-4"
                  >
                    <span className="block font-display text-[1.375rem] leading-[1.2] text-ink">{row.name}</span>
                    {row.barnName && (
                      <span className="mt-0.5 block font-condensed text-[0.75rem] uppercase tracking-[0.16em] text-muted">
                        {row.barnName}
                      </span>
                    )}
                  </Link>
                </div>
                {BOARD_MEALS.map((meal) => {
                  const current = meal === now;
                  return (
                    <div
                      key={meal}
                      role="cell"
                      className={`p-4 font-sans text-[0.9375rem] leading-snug ${
                        current ? "bg-surface font-semibold text-ink" : "font-normal text-muted"
                      }`}
                    >
                      <Items items={row.meals[meal]} />
                    </div>
                  );
                })}
              </div>
              {notes.length > 0 && (
                <div className="flex flex-col gap-1 pb-3">
                  {notes.map((note, i) => (
                    <CareBand key={i} note={note} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* The legend is part of the design: the board is read by people who
          did not configure it. */}
      <ul className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-4 font-condensed text-[0.75rem] text-muted">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-4 shrink-0 rounded-[2px] border border-rule bg-surface" />
          The meal happening now sits on white. The rest recede.
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-4 w-6 shrink-0 border-l-[3px] border-gold bg-gold-tint" />
          Medication or care due today
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="w-4 shrink-0 text-center font-sans text-[0.9375rem]">
            —
          </span>
          Nothing this meal. Never left blank.
        </li>
      </ul>
    </div>
  );
}

function PhoneBoard({ rows, now }: { rows: BoardRow[]; now: Meal }) {
  const [meal, setMeal] = useState<Meal>(now);
  // Hidden here, per the rule at the top: only horses fed this meal.
  const fed = rows.filter((row) => row.meals[meal].length > 0);

  return (
    <div className="flex flex-col gap-3 md:hidden">
      <div role="group" aria-label="Meal" className="grid grid-cols-3 border border-accent-text">
        {BOARD_MEALS.map((m) => {
          const active = m === meal;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={active}
              onClick={() => setMeal(m)}
              className={`min-h-11 font-condensed text-[0.8125rem] uppercase tracking-[0.2em] ${
                active ? "bg-accent-text font-semibold text-white" : "bg-transparent font-medium text-accent-text"
              }`}
            >
              {BOARD_MEAL_LABELS[m]}
              {m === now && <span className="sr-only"> (now)</span>}
            </button>
          );
        })}
      </div>

      <div className="flex items-baseline justify-between font-condensed text-[0.6875rem] uppercase tracking-[0.22em] text-muted">
        <span>
          {BOARD_MEAL_LABELS[meal]}
          {meal === now ? " · now" : ""}
        </span>
        <span className="tabular-nums">
          {fed.length} {fed.length === 1 ? "horse" : "horses"}
        </span>
      </div>

      {fed.length === 0 ? (
        <EmptyState title="Nothing to feed this meal" />
      ) : (
        <ul className="flex flex-col">
          {fed.map((row) => {
            const notes = row.notes.filter((note) => !note.meal || note.meal === meal);
            return (
              <li key={row.horseId} className="border-t border-line bg-surface">
                <Link href={chartHref(row.horseId)} className="flex gap-3 p-3.5 active:bg-sunk">
                  <span className="w-[118px] shrink-0">
                    <span className="block font-display text-[1.1875rem] leading-tight text-ink">{row.name}</span>
                    {row.barnName && (
                      <span className="mt-0.5 block font-condensed text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
                        {row.barnName}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 font-sans text-[0.9375rem] font-semibold leading-snug text-ink">
                    <Items items={row.meals[meal]} />
                  </span>
                </Link>
                {notes.length > 0 && (
                  <div className="flex flex-col gap-1 px-3.5 pb-3">
                    {notes.map((note, i) => (
                      <CareBand key={i} note={note} tight />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function FeedWhiteboard({ rows, now }: { rows: BoardRow[]; now: Meal }) {
  if (rows.length === 0) return <EmptyState title="No horses yet" />;
  return (
    <>
      <WallBoard rows={rows} now={now} />
      <PhoneBoard rows={rows} now={now} />
    </>
  );
}
