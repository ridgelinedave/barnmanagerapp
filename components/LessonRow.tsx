import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { moveLesson } from "@/app/(app)/lessons/learn/actions";

/**
 * One lesson in an Academy module: its place, its title, its length — and,
 * for the admin, the reorder controls INSIDE the row, at its right edge.
 *
 * They used to sit in a column of their own beside the row, which read as a
 * broken layout. The row is now one bordered object: the link fills it, the
 * two arrow buttons sit inside its border after the duration. (A button cannot
 * live inside a link, so the link is the row's flexible middle, not the row.)
 */
export function LessonRow({
  moduleId,
  lesson,
  index,
  count,
  duration,
  reorder,
}: {
  moduleId: string;
  lesson: { id: string; title: string };
  index: number;
  count: number;
  duration: string | null;
  /** Show the move-up / move-down controls (admin, and more than one lesson). */
  reorder: boolean;
}) {
  return (
    <li className="flex min-h-14 items-center gap-1 rounded-card border border-line bg-surface pr-1.5 lg:min-h-10 lg:rounded-none lg:border-0 lg:border-b lg:bg-transparent lg:pr-0">
      <Link
        href={`/lessons/learn/${moduleId}/${lesson.id}`}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 p-3.5 transition-colors duration-150 lg:min-h-10 lg:px-2 lg:py-2 lg:hover:bg-surface"
      >
        {/* The lesson's place in the module, tabular so 1–9 and 10+ line up. */}
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-control bg-sunk font-display text-heading tabular-nums text-ink lg:size-7 lg:bg-transparent lg:text-table"
        >
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 font-display text-heading leading-snug text-ink lg:font-sans lg:text-table lg:font-semibold">
          {lesson.title}
        </span>
        {duration && <span className="shrink-0 text-caption tabular-nums text-muted lg:text-table">{duration}</span>}
        {!reorder && <Icon name="chevron" className="size-5 shrink-0 text-muted lg:size-4" />}
      </Link>

      {reorder &&
        (["up", "down"] as const).map((direction) => {
          const disabled = direction === "up" ? index === 0 : index === count - 1;
          return (
            <form key={direction} action={moveLesson}>
              <input type="hidden" name="module_id" value={moduleId} />
              <input type="hidden" name="lesson_id" value={lesson.id} />
              <input type="hidden" name="direction" value={direction} />
              <button
                type="submit"
                disabled={disabled}
                aria-label={`Move “${lesson.title}” ${direction}`}
                className="flex size-11 items-center justify-center rounded-control text-muted hover:text-ink disabled:opacity-30 lg:size-8 lg:hover:bg-sunk"
              >
                <Icon
                  name="chevron"
                  className={`size-4 ${direction === "up" ? "-rotate-90" : "rotate-90"}`}
                  strokeWidth={2}
                />
              </button>
            </form>
          );
        })}
    </li>
  );
}
