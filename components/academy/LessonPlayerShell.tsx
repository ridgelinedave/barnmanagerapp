"use client";

import type { ReactNode } from "react";
import { useOptimistic, useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { formatDuration } from "@/lib/academy-format";

/**
 * The lesson player's main column: video, title, Mark complete, previous /
 * next, then the barn owner's notes.
 *
 * LAYOUT IS THE PAGE'S JOB. On the desk the page uses TabPage layout="split"
 * (the bucket's first real customer): this shell is the left column and the
 * course outline (CourseOutline compact) is `detail`, down the right with the
 * current lesson marked. On a phone the same two stack — video, these
 * details, then the list beneath.
 *
 * `video` is the existing VideoPlayer element (signed Stream playback,
 * minted server-side); the shell never touches a URL or a token.
 */
export function LessonPlayerShell({
  lessonId,
  video,
  title,
  position,
  durationSeconds,
  notes,
  completed,
  toggleAction,
  previousHref,
  nextHref,
  notesSlot,
}: {
  lessonId: string;
  video: ReactNode;
  title: string;
  /** "Lesson 3 of 12". */
  position?: string;
  durationSeconds: number | null;
  /** The barn owner's notes; nothing renders when empty (members see notes or nothing). */
  notes: string;
  completed: boolean;
  /** Receives `lesson_id` and `completed` (the NEW state). */
  toggleAction?: (formData: FormData) => void | Promise<void>;
  previousHref: string | null;
  nextHref: string | null;
  /** Admin: the notes editor replaces the read-only notes. */
  notesSlot?: ReactNode;
}) {
  const [shown, setShown] = useOptimistic(completed);
  const [pending, start] = useTransition();

  const toggle = () => {
    if (!toggleAction) return;
    const next = !shown;
    start(async () => {
      setShown(next);
      const fd = new FormData();
      fd.set("lesson_id", lessonId);
      fd.set("completed", next ? "true" : "false");
      await toggleAction(fd);
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {video}

      <div className="flex flex-col gap-1">
        <h2 className="font-display text-display leading-tight text-ink">{title}</h2>
        <p className="font-condensed text-label font-medium uppercase tracking-[0.08em] text-muted">
          {[position, formatDuration(durationSeconds)].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={shown ? "secondary" : "primary"}
          icon={shown ? "check" : undefined}
          arrow={false}
          aria-pressed={shown}
          disabled={!toggleAction || pending}
          onClick={toggle}
        >
          {shown ? "Completed" : "Mark complete"}
        </Button>
        <span className="flex-1" />
        {previousHref && (
          <ButtonLink href={previousHref} variant="secondary" icon="back">
            Previous
          </ButtonLink>
        )}
        {nextHref && (
          <ButtonLink href={nextHref} variant="secondary" arrow>
            Next
          </ButtonLink>
        )}
      </div>

      {notesSlot ??
        (notes.trim() ? (
          <section aria-label="Notes" className="flex flex-col gap-2 border-t border-rule pt-4">
            <h3 className="font-display text-title text-ink">Notes</h3>
            <p className="whitespace-pre-line text-body leading-relaxed text-ink">{notes}</p>
          </section>
        ) : null)}
    </div>
  );
}
