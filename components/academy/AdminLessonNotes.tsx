"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { LearningNotesEditor } from "@/components/LearningNotesEditor";
import { LessonNotes } from "@/components/academy/LessonNotes";

/**
 * The admin's notes on a lesson: shown exactly as members see them
 * (formatted), with Edit notes to open the editor. Opens straight into the
 * editor when there are none yet, since there is nothing to show.
 */
export function AdminLessonNotes({ lessonId, courseId, notes }: { lessonId: string; courseId: string; notes: string }) {
  const [editing, setEditing] = useState(!notes.trim());
  const headingId = `notes-heading-${lessonId}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 border-t border-rule pt-4">
      <div className="flex items-center gap-2">
        <h3 id={headingId} className="min-w-0 flex-1 font-display text-title text-ink">
          Notes
        </h3>
        {notes.trim() && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing((e) => !e)} className="max-lg:min-h-11">
            {editing ? "Done" : "Edit notes"}
          </Button>
        )}
      </div>
      {editing ? (
        <LearningNotesEditor lessonId={lessonId} moduleId={courseId} notes={notes} labelledBy={headingId} />
      ) : (
        <LessonNotes text={notes} />
      )}
    </section>
  );
}
