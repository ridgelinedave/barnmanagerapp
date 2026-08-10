import Link from "next/link";
import { EmptyState } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { feedCadence, horseInitials, horseSubtitle } from "@/lib/horse-display";
import type { HorseFeed } from "@/lib/horses";

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

  if (horse.photo_url) {
    return (
      /* Storage URLs are signed per request and differ per viewer, so
         next/image cannot cache them — it would proxy a one-time URL. */
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={horse.photo_url}
        alt=""
        className="size-[3.25rem] shrink-0 rounded-avatar object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex size-[3.25rem] shrink-0 items-center justify-center rounded-avatar bg-accent font-display text-[1.375rem] font-bold tracking-[0.04em] text-accent-on"
    >
      {horseInitials(horse)}
    </span>
  );
}

export function FeedBoard({ board }: { board: HorseFeed[] }) {
  if (board.length === 0) {
    return (
      <EmptyState
        title="No horses yet"
        body="Add the first one and its feed chart appears here."
      />
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
                <span className="block font-display text-[1.25rem] font-semibold leading-tight tracking-[0.02em] text-ink">
                  {entry.horse.barn_name || entry.horse.name}
                </span>
                {subtitle && (
                  <span className="mt-0.5 block truncate text-caption text-muted">{subtitle}</span>
                )}
              </span>

              {cadence ? (
                <span className="shrink-0 rounded-[0.375rem] bg-accent-tint px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-accent-text">
                  {cadence}
                </span>
              ) : (
                /* No chart is a state worth seeing on the board, not a blank. */
                <span className="shrink-0 rounded-[0.375rem] bg-sunk px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-muted">
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
