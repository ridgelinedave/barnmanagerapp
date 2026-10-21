"use client";

import { useCallback } from "react";
import { VideoPlayer } from "@/components/VideoPlayer";
import type { Playback } from "@/lib/video";
import { enrolInCourse, setLessonComplete } from "@/app/(app)/lessons/learn/course-actions";

/**
 * The lesson's video with progress wired in: the first play enrols the
 * viewer in the course (auto-enrol), and watching to 90% — or the end —
 * ticks the lesson off. Both are the viewer's own rows, written on their
 * own session (RLS: own rows only).
 *
 * Nothing is written for a lesson already complete, or a course already
 * enrolled in: no needless refresh while someone is watching.
 */
export function LessonVideo({
  playback,
  title,
  lessonId,
  courseId,
  completed,
  enrolled,
}: {
  playback: Playback;
  title: string;
  lessonId: string;
  courseId: string;
  completed: boolean;
  enrolled: boolean;
}) {
  const onPlay = useCallback(() => {
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

  return <VideoPlayer playback={playback} title={title} onPlay={onPlay} onComplete={onComplete} />;
}
