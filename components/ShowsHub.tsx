"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/primitives";
import type { ShowSummary } from "@/lib/shows";

/**
 * The Shows hub, to the monarch-feeds mockup.
 *
 * Three sub-tabs, a horizontal carousel of show cards, then a compact "next up"
 * list. The sub-tabs live INSIDE this screen — the bottom tab bar is untouched,
 * because a second row of app-level navigation is how people lose track of
 * where they are.
 *
 * Client-side because the sub-tab is view state and nothing more: switching
 * from Upcoming to Results should not cost a round trip when every row is
 * already here. The data arrives pre-scoped by RLS; this component never
 * decides who sees what.
 */
type Tab = "upcoming" | "results" | "pinned";

const TABS: { key: Tab; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "results", label: "Results" },
  { key: "pinned", label: "Pinned" },
];

const EMPTY: Record<Tab, { title: string; body: string }> = {
  upcoming: {
    title: "No shows coming up",
    body: "When the barn adds the next competition it appears here with dates and ride times.",
  },
  results: {
    title: "No results yet",
    body: "Placings and scores land here once a show has been ridden.",
  },
  pinned: {
    title: "Nothing pinned",
    body: "The barn pins the show it wants everyone looking at. None is pinned right now.",
  },
};

/**
 * The banner. A tinted plane when a show has no image — never a broken frame.
 *
 * IT RENDERS `bannerUrl`, NOT `image_path`. The column holds an object name
 * inside a PRIVATE bucket (`<show_id>/<filename>`), which is not a URL and
 * never was — putting it in a `src` produced a request to /<uuid>/<file> on
 * this origin and a broken image on every show with a banner. lib/shows.ts
 * mints a short-lived signed link per request instead, so Storage RLS decides
 * whether the link exists at all. A caller who may not read it gets the
 * gradient, which is a fallback rather than a failure.
 */
function Banner({ summary }: { summary: ShowSummary }) {
  const { show, bannerUrl } = summary;
  return (
    <div className="relative h-[7.5rem] w-full overflow-hidden bg-accent-text">
      {bannerUrl ? (
        /* Signed, per-request storage URL — next/image would proxy a one-time
           link it cannot cache. Same reason as the horse profile photo. */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={bannerUrl} alt="" className="size-full object-cover" />
      ) : (
        /* Two oxbloods on the diagonal. Deliberately abstract: a stock horse
           photo on every card would say less than the show's own name. */
        <div
          aria-hidden="true"
          className="size-full bg-[linear-gradient(135deg,var(--color-accent),var(--color-accent-text))]"
        />
      )}

      {show.pinned && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-chip bg-gold px-2 py-0.5 font-display text-eyebrow uppercase text-ink">
          <Icon name="pin" className="size-3" strokeWidth={2} />
          Pinned
        </span>
      )}
    </div>
  );
}

function ShowCard({ summary }: { summary: ShowSummary }) {
  const { show, dateLabel } = summary;
  return (
    <Link
      href={`/lessons/shows/${show.id}`}
      /* 15.5rem, and shrink-0 so the row scrolls instead of squashing. The
         next card peeking past the edge is what tells a thumb to swipe. */
      className="flex w-62 shrink-0 flex-col overflow-hidden rounded-card border border-line border-l-[3px] border-l-accent-text bg-surface shadow-card"
    >
      <Banner summary={summary} />
      <span className="flex flex-col gap-0.5 p-3">
        <span className="font-display text-heading leading-tight text-ink">{show.name}</span>
        {show.location && <span className="text-caption text-muted">{show.location}</span>}
        <span className="mt-1 font-display text-label font-bold text-accent-text">{dateLabel}</span>
      </span>
    </Link>
  );
}

/** The date block on a next-up row: month over day, the way a diary reads. */
function DateBlock({ iso }: { iso: string }) {
  const at = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", opts).format(new Date(`${iso}T12:00:00Z`));
  return (
    <span className="w-11 shrink-0 text-center">
      <span className="block font-display text-eyebrow uppercase text-muted">
        {at({ month: "short", timeZone: "UTC" })}
      </span>
      <span className="block font-display text-title leading-none text-accent-text">
        {at({ day: "numeric", timeZone: "UTC" })}
      </span>
    </span>
  );
}

function NextUpRow({ summary, isBarn }: { summary: ShowSummary; isBarn: boolean }) {
  const { show, riderCount, mine, rideTimesPosted } = summary;

  // The meta line answers "is this mine and is it settled yet?" in one glance.
  const riders = riderCount === 1 ? "1 rider" : `${riderCount} riders`;
  const meta = riderCount === 0
    ? "No entries yet"
    : `${riders} · ${rideTimesPosted ? "ride times posted" : "entries open"}`;

  return (
    <Link
      href={`/lessons/shows/${show.id}`}
      className="flex min-h-14 items-center gap-3 rounded-card border border-line bg-surface p-3"
    >
      <DateBlock iso={show.start_date} />
      <span className="min-w-0 flex-1">
        <span className="block font-display text-heading leading-tight text-ink">{show.name}</span>
        <span className="mt-0.5 block text-caption text-muted">{meta}</span>
      </span>
      {/*
       * Not a button — the whole row is the link. A pill inside a link that
       * looked pressable would be a second target doing the same thing. The
       * barn never sees "My rides": Belle has no rider, she opens the roster.
       *
       * "REGISTER" IS GONE, and it was the only thing on this screen promising
       * something the app cannot do. Families are read-only here — the barn
       * enters riders — so a pill styled exactly like the tappable "My rides"
       * one, saying Register, was an invitation to a self-service flow that
       * does not exist. It is a quiet line of text now, in the muted tone, so
       * it reads as an instruction rather than a control.
       */}
      {isBarn ? (
        <span className="shrink-0 rounded-chip bg-accent-tint px-2.5 py-1 font-display text-eyebrow uppercase text-accent-text">
          Roster
        </span>
      ) : mine ? (
        <span className="shrink-0 rounded-chip bg-accent-tint px-2.5 py-1 font-display text-eyebrow uppercase text-accent-text">
          My rides
        </span>
      ) : (
        <span className="max-w-24 shrink-0 text-right text-caption leading-tight text-muted">
          Contact the barn to enter
        </span>
      )}
    </Link>
  );
}

export function ShowsHub({
  upcoming,
  results,
  pinned,
  isBarn,
}: {
  upcoming: ShowSummary[];
  results: ShowSummary[];
  pinned: ShowSummary[];
  /** Staff or admin. Changes the row action from family-facing to roster. */
  isBarn: boolean;
}) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const shown = { upcoming, results, pinned }[tab];

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tabs. Underline rather than a segmented control: this is a filter
          on one list, not a switch between three screens. */}
      <div role="tablist" aria-label="Shows" className="flex gap-5 border-b border-line">
        {TABS.map(({ key, label }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={`-mb-px flex min-h-11 items-center border-b-2 font-display text-label uppercase tracking-[0.08em] transition-colors ${
                active
                  ? "border-accent-text text-accent-text"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState title={EMPTY[tab].title} body={EMPTY[tab].body} />
      ) : (
        <>
          {/* The carousel. -mx-4/px-4 lets it bleed to the screen edge while
              keeping the first card aligned with the page gutter, so the row
              reads as scrollable rather than clipped. */}
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
            {shown.map((summary) => (
              <div key={summary.show.id} className="snap-start">
                <ShowCard summary={summary} />
              </div>
            ))}
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="relative pb-1.5 font-display text-heading text-accent-text after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-6 after:bg-gold after:content-['']">
              {tab === "results" ? "How we did" : "The team's next up"}
            </h2>
            {shown.map((summary) => (
              <NextUpRow key={summary.show.id} summary={summary} isBarn={isBarn} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
