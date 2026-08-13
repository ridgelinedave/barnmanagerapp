import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { Card, Chip, ChipRow, EmptyState, SectionHeader, Sunk } from "@/components/ui/primitives";
import { requireTab } from "@/lib/guard";
import { loadShow, ordinal, showDateLabel } from "@/lib/shows";
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

export default async function ShowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTab("/shows");
  if (!featureEnabled("shows")) notFound();

  const { id } = await params;
  const detail = await loadShow(id);
  // Null covers "no such show" AND "RLS says this is not yours" — deliberately
  // the same answer, because a 403 would confirm the show exists.
  if (!detail) notFound();

  const { show, entries, results } = detail;

  return (
    <TabPage title={show.name} back="/shows">
      <Card className="flex flex-col gap-3 p-4">
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
            body="Riders appear here as the barn enters them."
          />
        ) : (
          entries.map((entry) => (
            <Card key={entry.id} className="flex items-baseline gap-3 p-4">
              <span className="min-w-0 flex-1">
                <span className="block font-display text-heading leading-snug text-ink">
                  {entry.riderName}
                </span>
                <span className="mt-0.5 block text-caption text-muted">
                  {[entry.horseName, entry.classes].filter(Boolean).join(" · ") || "Entry confirmed"}
                </span>
              </span>
              {entry.ride_time && (
                <span className="shrink-0 font-display text-heading tabular-nums text-accent-text">
                  {rideTimeLabel(entry.ride_time)}
                </span>
              )}
            </Card>
          ))
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Results                                                           */}
      {/* ---------------------------------------------------------------- */}
      {results.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Results" count={`${results.length}`} />
          {results.map((result) => (
            <Sunk key={result.id} className="flex items-baseline gap-3">
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
            </Sunk>
          ))}
        </section>
      )}
    </TabPage>
  );
}
