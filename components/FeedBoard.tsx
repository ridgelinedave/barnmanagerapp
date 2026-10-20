import Link from "next/link";
import { EmptyState } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { feedCadence, horseInitials, horseSubtitle } from "@/lib/horse-display";
import type { HorseFeed } from "@/lib/horses";
import type { RecentCare } from "@/lib/care";
import { FaceImage } from "@/components/ui/FaceImage";
import { formatBarnDayLabel } from "@/lib/dates";
import { CARE_TYPE_LABELS } from "@/lib/types";

/**
 * The feed board, by horse.
 *
 * Built to design/mockups/feedboard.html. The old board was meal-major — three
 * lists, the same horse in each — which is how a spreadsheet thinks about
 * feeding. Someone standing in the aisle thinks horse-major: they are in front
 * of one animal and want that animal's chart. So this is a list of horses, and
 * tapping one opens its chart.
 *
 * Rows, not cards: a hairline between them and nothing else. Six boxed cards
 * with shadows would be six competing rectangles; the divider does the work and
 * the photo carries the identification. A horse photo is the one image in this
 * app with a job — it tells you which animal this is — so it is not decoration.
 */
function HorseAvatar({ entry }: { entry: HorseFeed }) {
  const { horse } = entry;
  const initials = (
    <span
      aria-hidden="true"
      className="flex size-[3.25rem] shrink-0 items-center justify-center rounded-full bg-accent-tint font-display text-[1.375rem] tracking-[0.04em] text-accent-text"
    >
      {horseInitials(horse)}
    </span>
  );

  if (!horse.photo_url) return initials;
  return (
    <FaceImage
      src={horse.photo_url}
      className="size-[3.25rem] shrink-0 rounded-full object-cover"
      fallback={initials}
    />
  );
}

/**
 * "Had something specific in the last three days, and when it is due again."
 * One quiet line under the horse's name: "Dewormer yesterday · due Jan 12".
 */
function recentLine(recent: RecentCare[]): string {
  return recent
    .map(({ event, daysAgo }) => {
      const when = daysAgo <= 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`;
      const due = event.due_next ? ` · due ${formatBarnDayLabel(event.due_next)}` : "";
      return `${CARE_TYPE_LABELS[event.type]} ${when}${due}`;
    })
    .join("; ");
}

export function FeedBoard({
  board,
  recent = new Map(),
}: {
  board: HorseFeed[];
  /** Care in the last three days, by horse id (lib/care careRecentByHorse). */
  recent?: Map<string, RecentCare[]>;
}) {
  if (board.length === 0) {
    return (
      <EmptyState title="No horses yet" />
    );
  }

  return (
    <ul className="-mx-1">
      {board.map((entry) => {
        const cadence = feedCadence(entry.plans);
        const subtitle = horseSubtitle(entry.horse);

        return (
          <li key={entry.horse.id} className="border-b border-line last:border-b-0">
            <Link
              href={`/tasks/feed/${entry.horse.id}`}
              className="flex min-h-16 items-center gap-3.5 px-1 py-3 active:bg-sunk"
            >
              <HorseAvatar entry={entry} />

              <span className="min-w-0 flex-1">
                <span className="block font-display text-[1.25rem] leading-tight text-ink">
                  {entry.horse.barn_name || entry.horse.name}
                </span>
                {subtitle && (
                  <span className="mt-0.5 block truncate text-caption text-muted">{subtitle}</span>
                )}
                {recent.get(entry.horse.id)?.length ? (
                  <span className="mt-1 block font-condensed text-label font-semibold text-accent-text">
                    {recentLine(recent.get(entry.horse.id)!)}
                  </span>
                ) : null}
              </span>

              {cadence ? (
                <span className="shrink-0 rounded-chip border border-ink/40 px-1.5 py-0.5 font-condensed text-micro uppercase text-ink">
                  {cadence}
                </span>
              ) : (
                /* No chart is a state worth seeing on the board, not a blank. */
                <span className="shrink-0 rounded-chip border border-muted/60 px-1.5 py-0.5 font-condensed text-micro uppercase text-muted">
                  No chart
                </span>
              )}

              <Icon name="chevron" className="size-4 shrink-0 text-line" strokeWidth={2} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
