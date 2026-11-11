"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { setCoursePublished } from "@/app/(app)/lessons/learn/course-actions";

/**
 * Publish / Unpublish for one course, with a second step that says WHO will
 * see it (or stop seeing it) before anything changes. The same pattern as
 * ConfirmDelete: the safe answer first and focused.
 *
 * The button lives in the page header, so the question opens in the app's
 * Sheet (a modal on the desk, a bottom sheet on a phone) instead of pushing
 * the header open.
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
  /** "Lesson students and every client with Academy access" — who a published course reaches. */
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

  return (
    <>
      <Button type="button" variant={published ? "secondary" : "primary"} arrow={false} onClick={() => setAsking(true)}>
        {published ? "Unpublish" : "Publish"}
      </Button>
      <Sheet open={asking} onClose={() => setAsking(false)} title={published ? `Unpublish ${title}` : `Publish ${title}`}>
        <div className="flex flex-col gap-4">
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
      </Sheet>
    </>
  );
}
