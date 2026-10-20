"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { FaceImage } from "@/components/ui/FaceImage";
import { Icon } from "@/components/ui/Icon";
import { formatDuration } from "@/lib/academy-format";

/**
 * One lesson in a course outline: completion circle, 16:9 thumbnail, title,
 * duration right-aligned in tabular numbers ("Processing" until Stream has
 * finished encoding — never a blank or a zero).
 *
 * THE CIRCLE IS A REAL BUTTON (aria-pressed), its own 44px target, separate
 * from the row link — ticking a lesson off must not open it. It flips at once
 * (optimistic) and the server action settles it; on failure React rolls the
 * optimistic state back.
 *
 * Presentational: typed props; the page hands in the toggle action, the
 * signed thumbnail and the href.
 */
export type AcademyLessonRowProps = {
  id: string;
  title: string;
  href: string;
  durationSeconds: number | null;
  /** A SIGNED Stream thumbnail URL (signed like playback), or null. */
  thumbnailSrc: string | null;
  completed: boolean;
  /** The lesson now playing — marked in the player's list. */
  current?: boolean;
  /** Server action toggling completion; receives `lesson_id` and `completed` (the NEW state). */
  toggleAction?: (formData: FormData) => void | Promise<void>;
};

function Thumb({ src }: { src: string | null }) {
  const empty = (
    <span aria-hidden="true" className="flex aspect-video w-16 shrink-0 items-center justify-center rounded-control bg-sunk text-muted sm:w-24 lg:w-28">
      <Icon name="play" className="size-5" />
    </span>
  );
  if (!src) return empty;
  return <FaceImage src={src} className="aspect-video w-16 shrink-0 rounded-control border border-rule object-cover sm:w-24 lg:w-28" fallback={empty} />;
}

export function CompletionButton({
  lessonId,
  title,
  completed,
  toggleAction,
}: {
  lessonId: string;
  title: string;
  completed: boolean;
  toggleAction?: (formData: FormData) => void | Promise<void>;
}) {
  const [shown, setShown] = useOptimistic(completed);
  const [, start] = useTransition();

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
    <button
      type="button"
      onClick={toggle}
      disabled={!toggleAction}
      aria-pressed={shown}
      aria-label={shown ? `${title}: completed. Mark not complete` : `Mark ${title} complete`}
      className="-m-2.5 flex size-11 shrink-0 items-center justify-center rounded-full disabled:cursor-default"
    >
      <span
        aria-hidden="true"
        className={`flex size-6 items-center justify-center rounded-full border-2 ${
          shown ? "border-accent bg-accent text-accent-on" : "border-ink/50 bg-transparent"
        }`}
      >
        {shown && <Icon name="check" className="size-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

export function AcademyLessonRow({
  id,
  title,
  href,
  durationSeconds,
  thumbnailSrc,
  completed,
  current = false,
  toggleAction,
}: AcademyLessonRowProps) {
  const processing = !durationSeconds;

  return (
    <li
      className={`flex items-center gap-3 border-b border-rule py-2.5 pl-2.5 last:border-b-0 ${
        current ? "border-l-2 border-l-accent bg-surface/70 pl-2" : ""
      }`}
    >
      <CompletionButton lessonId={id} title={title} completed={completed} toggleAction={toggleAction} />
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control lg:hover:bg-surface/70"
      >
        <Thumb src={thumbnailSrc} />
        <span className={`min-w-0 flex-1 font-sans text-body leading-snug ${current ? "font-semibold text-ink" : "text-ink"}`}>
          {title}
        </span>
        <span className={`shrink-0 pr-1 font-condensed text-label tabular-nums ${processing ? "text-muted" : "text-ink"}`}>
          {formatDuration(durationSeconds)}
        </span>
      </Link>
    </li>
  );
}
