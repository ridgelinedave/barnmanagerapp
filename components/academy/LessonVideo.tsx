"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VideoPlayer } from "@/components/VideoPlayer";
import { ButtonLink } from "@/components/ui/Button";
import type { Playback } from "@/lib/video";
import { enrolInCourse, setLessonComplete } from "@/app/(app)/lessons/learn/course-actions";

/**
 * The lesson's video with progress wired in: the first play enrols the
 * viewer in the course (auto-enrol), and watching to 90% — or the end —
 * ticks the lesson off. Both are the viewer's own rows, written on their
 * own session (RLS: own rows only). The position is remembered on this
 * device, so the lesson picks up where they left off.
 *
 * AT THE END (Circle's auto-advance): a panel over the video, "Next: <title>"
 * with a 10-second countdown, Play now and Cancel. After the course's last
 * lesson it says the course is complete (when every other lesson is) and
 * offers the way back to the course.
 *
 * Nothing is written for a lesson already complete, or a course already
 * enrolled in: no needless refresh while someone is watching.
 */
const ADVANCE_SECONDS = 10;

export function LessonVideo({
  playback,
  title,
  lessonId,
  courseId,
  completed,
  enrolled,
  next,
  courseHref,
  courseDoneAfterThis,
}: {
  playback: Playback;
  title: string;
  lessonId: string;
  courseId: string;
  completed: boolean;
  enrolled: boolean;
  /** The next lesson in reading order, or null on the last one. */
  next: { href: string; title: string } | null;
  courseHref: string;
  /** Every OTHER lesson of the course is complete, so finishing this one finishes it. */
  courseDoneAfterThis: boolean;
}) {
  const router = useRouter();
  const [ended, setEnded] = useState(false);
  const [left, setLeft] = useState(ADVANCE_SECONDS);
  const [counting, setCounting] = useState(false);

  const onPlay = useCallback(() => {
    setEnded(false);
    setCounting(false);
    if (enrolled) return;
    const fd = new FormData();
    fd.set("module_id", courseId);
    void enrolInCourse(fd);
  }, [enrolled, courseId]);

  const onComplete = useCallback(() => {
    if (completed) return;
    const fd = new FormData();
    fd.set("lesson_id", lessonId);
    fd.set("completed", "true");
    void setLessonComplete(fd);
  }, [completed, lessonId]);

  const onEnded = useCallback(() => {
    setEnded(true);
    setLeft(ADVANCE_SECONDS);
    setCounting(Boolean(next));
  }, [next]);

  useEffect(() => {
    if (!counting || !next) return;
    if (left <= 0) {
      router.push(next.href);
      return;
    }
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [counting, left, next, router]);

  const overlay = ended ? (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/85 px-4 text-center text-white">
      {next ? (
        <>
          <p className="font-condensed text-label font-semibold uppercase tracking-[0.08em] text-white/80" aria-live="polite">
            {counting ? `Next lesson in ${left}` : "Next lesson"}
          </p>
          <p className="max-w-md font-display text-title leading-snug">{next.title}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <ButtonLink href={next.href} variant="primary">
              Play now
            </ButtonLink>
            {counting && (
              // Light on the dark panel: the secondary button is ink-on-ground and would vanish here.
              <button
                type="button"
                onClick={() => setCounting(false)}
                autoFocus
                className="inline-flex min-h-11 items-center rounded-control border border-white/70 px-4 font-condensed text-label font-semibold uppercase tracking-[0.08em] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:hover:bg-white/10"
              >
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="font-display text-title leading-snug">{courseDoneAfterThis ? "Course complete" : "That was the last lesson"}</p>
          <ButtonLink href={courseHref} variant="primary">
            Back to the course
          </ButtonLink>
        </>
      )}
    </div>
  ) : null;

  return (
    <VideoPlayer
      playback={playback}
      title={title}
      onPlay={onPlay}
      onComplete={onComplete}
      onEnded={onEnded}
      resumeKey={lessonId}
      overlay={overlay}
    />
  );
}
