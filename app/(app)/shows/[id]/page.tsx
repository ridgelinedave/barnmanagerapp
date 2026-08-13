import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { ShowManageMenu } from "@/components/ShowManageMenu";
import { EntryForm, ResultForm } from "@/components/ShowAdmin";
import { SheetTrigger } from "@/components/ui/Sheet";
import { Card, Chip, ChipRow, EmptyState, SectionHeader, Sunk } from "@/components/ui/primitives";
import { requireTab } from "@/lib/guard";
import { canManageShows, loadShow, ordinal, showDateLabel } from "@/lib/shows";
import { listVisibleRiders } from "@/lib/lessons";
import { listHorses } from "@/lib/horses";
import { formatTime } from "@/lib/dates";
import { barn, featureEnabled } from "@/config/barn";

export const metadata = { title: "Show" };

/**
 * One show: the facts, who is going, when they ride, and how it went.
 *
 * A parent reaching this page sees the roster filtered to their OWN riders —
 * that is migration 0021's policy, not a filter in this file. The heading is
 * "Who is going" rather than "Roster" for exactly that reason: a family seeing
 * a two-name list under "Roster" would read it as the whole barn sending two
 * riders, and a heading that lies is worse than a vague one.
 *
 * FAMILIES ARE READ-ONLY on this screen and there is no self-service entry
 * flow: the barn manages the roster, so every control below is behind
 * `canManageShows()`, which mirrors the `has_permission('manage_shows')` the
 * write policies actually enforce.
 */
function rideTimeLabel(iso: string): string {
  // The stored value is an instant; the barn reads it as a wall clock.
  const hhmm = new Intl.DateTimeFormat("en-GB", {
    timeZone: barn.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return formatTime(hhmm);
}

/** The ride DAY, for a multi-day show where a time alone is ambiguous. */
function rideDayLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: barn.timezone,
    weekday: "short",
  }).format(new Date(iso));
}

export default async function ShowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTab("/shows");
  if (!featureEnabled("shows")) notFound();

  const { id } = await params;
  const detail = await loadShow(id);
  // Null covers "no such show" AND "RLS says this is not yours" — deliberately
  // the same answer, because a 403 would confirm the show exists.
  if (!detail) notFound();

  const { show, entries, results, bannerUrl } = detail;

  const canManage = await canManageShows();

  // The pickers are only fetched for someone who can actually write. A family
  // has no use for them and the riders read would be scoped to their own
  // family anyway, which would make a picker that looks broken.
  const [riders, horses] = canManage
    ? await Promise.all([listVisibleRiders(), listHorses()])
    : [[], []];

  const riderOptions = riders.map((r) => ({ id: r.id, name: r.name }));
  const horseOptions = horses.map((h) => ({ id: h.id, name: h.name }));

  const multiDay = show.start_date !== show.end_date;

  return (
    <TabPage
      title={show.name}
      back="/shows"
      action={canManage ? <ShowManageMenu show={show} /> : undefined}
    >
      <Card className="flex flex-col gap-3 p-4">
        {/*
         * The banner, when there is one. Signed per request from the private
         * bucket (lib/shows.ts) — `image_path` is an object name and is never
         * put in a `src`. No signed link means no banner rather than a broken
         * frame; the card keeps its gradient on the hub for the same reason.
         *
         * -m-4 mb-0 lets it run to the card's edges while the rest of the
         * content keeps the padding. Fixed aspect so nothing reflows when it
         * loads.
         */}
        {bannerUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={bannerUrl}
            alt=""
            className="-m-4 mb-0 h-40 w-[calc(100%+2rem)] max-w-none object-cover"
          />
        )}

        <div>
          <p className="font-display text-title leading-tight text-ink">{show.name}</p>
          {show.location && <p className="mt-0.5 text-caption text-muted">{show.location}</p>}
        </div>

        <ChipRow>
          <Chip value={showDateLabel(show.start_date, show.end_date)} icon="calendar" />
          {show.pinned && <Chip value="Pinned" icon="pin" tone="gold" />}
          {show.visibility === "staff" && <Chip value="Staff only" icon="alert" tone="gold" />}
        </ChipRow>

        {show.description && <p className="text-body text-ink">{show.description}</p>}
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Roster and ride times                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Who is going"
          count={entries.length === 0 ? undefined : `${entries.length}`}
        />

        {entries.length === 0 ? (
          <EmptyState
            title="No entries yet"
            body={
              canManage
                ? "Enter the first rider below. Ride times can wait until the prize list lands."
                : "Riders appear here as the barn enters them."
            }
          />
        ) : (
          entries.map((entry) => (
            <Card key={entry.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-heading leading-snug text-ink">
                    {entry.riderName}
                  </span>
                  <span className="mt-0.5 block text-caption text-muted">
                    {[entry.horseName, entry.classes].filter(Boolean).join(" · ") ||
                      "Entry confirmed"}
                  </span>
                </span>
                {entry.ride_time && (
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-heading tabular-nums text-accent-text">
                      {rideTimeLabel(entry.ride_time)}
                    </span>
                    {/* The day only earns its line on a show that spans one —
                        on a one-day show it is the same word on every row. */}
                    {multiDay && (
                      <span className="block text-caption text-muted">
                        {rideDayLabel(entry.ride_time)}
                      </span>
                    )}
                  </span>
                )}
              </div>

              {canManage && (
                <SheetTrigger label="Edit entry" title={entry.riderName}>
                  <EntryForm
                    showId={show.id}
                    entry={entry}
                    riders={riderOptions}
                    horses={horseOptions}
                    timeZone={barn.timezone}
                    defaultDate={show.start_date}
                  />
                </SheetTrigger>
              )}
            </Card>
          ))
        )}

        {canManage && (
          <SheetTrigger label="Enter a rider" title={`Enter a rider — ${show.name}`} variant="primary">
            <EntryForm
              showId={show.id}
              riders={riderOptions}
              horses={horseOptions}
              timeZone={barn.timezone}
              defaultDate={show.start_date}
            />
          </SheetTrigger>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Results                                                           */}
      {/*                                                                   */}
      {/* The section renders whenever there are results OR someone who can  */}
      {/* add them. A family looking at a show with nothing posted still     */}
      {/* sees no Results heading, which is the honest answer.               */}
      {/* ---------------------------------------------------------------- */}
      {(results.length > 0 || canManage) && (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Results"
            count={results.length === 0 ? undefined : `${results.length}`}
          />

          {results.length === 0 ? (
            <EmptyState
              title="Nothing posted yet"
              body="Placings and scores land here once the classes have been ridden."
            />
          ) : (
            results.map((result) => (
              <Sunk key={result.id} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-heading leading-snug text-ink">
                      {result.riderName}
                    </span>
                    {result.class && (
                      <span className="mt-0.5 block text-caption text-muted">{result.class}</span>
                    )}
                  </span>
                  {result.score !== null && (
                    <span className="shrink-0 text-caption tabular-nums text-muted">
                      {result.score}
                    </span>
                  )}
                  {/* Placing is the fact people look for, so it is the loud one.
                      An unplaced ride says so in words rather than showing a gap. */}
                  <span className="shrink-0 font-display text-heading tabular-nums text-accent-text">
                    {result.placing === null ? "—" : ordinal(result.placing)}
                  </span>
                </div>

                {canManage && (
                  <SheetTrigger
                    label="Edit result"
                    title={`${result.riderName}${result.class ? ` — ${result.class}` : ""}`}
                  >
                    <ResultForm showId={show.id} result={result} riders={riderOptions} />
                  </SheetTrigger>
                )}
              </Sunk>
            ))
          )}

          {canManage && (
            <SheetTrigger label="Add a result" title={`New result — ${show.name}`} variant="primary">
              <ResultForm showId={show.id} riders={riderOptions} />
            </SheetTrigger>
          )}
        </section>
      )}
    </TabPage>
  );
}
