import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { ROW_LINK, ROW_TITLE } from "@/components/ui/ListRow";
import { moveLesson } from "@/app/(app)/lessons/learn/actions";

/**
 * One lesson in an Academy module: its place, its title, its length — and,
 * for the admin, the reorder controls INSIDE the row, at its right edge.
 *
 * They used to sit in a column of their own beside the row, which read as a
 * broken layout. Now the row is one editorial row (a rule under it, the title
 * in Marcellus): the link fills it, the two arrow buttons sit inside it after
 * the duration. (A button cannot live inside a link, so the link is the row's
 * flexible middle, not the row.)
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
    <li className="flex min-h-14 w-full items-center gap-1 border-b border-rule lg:min-h-11">
      <Link
        href={`/lessons/learn/${moduleId}/${lesson.id}`}
        className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 self-stretch lg:min-h-11 ${ROW_LINK}`}
      >
        {/* The lesson's place in the module: a numeral, condensed and
            tabular so 1–9 and 10+ line up. No tile behind it. */}
        <span aria-hidden="true" className="w-5 shrink-0 font-condensed text-heading font-semibold tabular-nums text-muted">
          {index + 1}
        </span>
        <span className={`${ROW_TITLE} min-w-0 flex-1 text-ink`}>{lesson.title}</span>
        {duration && <span className="shrink-0 font-condensed text-label font-medium tabular-nums text-muted">{duration}</span>}
        {!reorder && <Icon name="chevron" className="size-4 shrink-0 text-muted" />}
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
