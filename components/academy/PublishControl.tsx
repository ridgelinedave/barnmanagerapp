"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { setCoursePublished } from "@/app/(app)/lessons/learn/course-actions";

/**
 * Publish / Unpublish for one course, with a second step that says WHO will
 * see it (or stop seeing it) before anything changes. The same pattern as
 * ConfirmDelete: the safe answer first and focused, where the first button
 * was, so a double tap keeps things as they are.
 *
 * `audience` is the sentence the page builds from the course's own audience
 * and the rule in learning_audience_allows — never a guess.
 */
export function PublishControl({
  courseId,
  title,
  published,
  audience,
  lessonCount,
}: {
  courseId: string;
  title: string;
  published: boolean;
  /** "All staff and every client" — who a published course reaches. */
  audience: string;
  lessonCount: number;
}) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();

  const commit = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("id", courseId);
      fd.set("published", published ? "false" : "true");
      await setCoursePublished(fd);
      setAsking(false);
    });

  if (!asking) {
    return (
      <Button type="button" variant={published ? "secondary" : "primary"} arrow={false} onClick={() => setAsking(true)}>
        {published ? "Unpublish" : "Publish"}
      </Button>
    );
  }

  return (
    <div role="group" aria-label={published ? `Unpublish ${title}` : `Publish ${title}`} className="flex basis-full flex-col gap-2">
      <p className="text-body text-ink">
        {published ? (
          <>
            Unpublish “{title}”? {audience} will stop seeing it. Everyone’s progress is kept for when it comes back.
          </>
        ) : (
          <>
            Publish “{title}”? {audience} will see it straight away.
            {lessonCount === 0 && " It has no lessons yet."}
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button autoFocus type="button" variant="secondary" arrow={false} onClick={() => setAsking(false)} disabled={pending}>
          {published ? "Keep published" : "Keep as draft"}
        </Button>
        <Button type="button" variant={published ? "secondary" : "primary"} arrow={false} onClick={commit} disabled={pending}>
          {pending ? "Saving" : published ? "Unpublish" : "Publish"}
        </Button>
      </div>
    </div>
  );
}
