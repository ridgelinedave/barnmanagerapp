"use client";

import { useActionState, useEffect, useId, useState, useTransition, type DragEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormFeedback, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDeleteForm } from "@/components/ConfirmDelete";
import { SectionVideoDrop } from "@/components/academy/SectionVideoDrop";
import { formatDuration } from "@/lib/academy-format";
import {
  createSection,
  deleteLesson,
  deleteSection,
  renameLesson,
  renameSection,
  reorderSectionLessons,
  reorderSections,
  type CourseState,
} from "@/app/(app)/lessons/learn/course-actions";

/**
 * The admin's outline editor for one course: sections and their lessons.
 *
 * REORDERING. On the desk: drag a lesson by its handle (within a section or
 * into another one) or a section by its handle; the handle also takes
 * ArrowUp / ArrowDown for a keyboard. On a phone: Up / Down buttons inside
 * the row — never floating arrows beside it. Every reorder sends the COMPLETE
 * new order to the database (whole-list rewrite, 0028), shows it at once and
 * then settles from the server.
 *
 * Each lesson row is also the way to the lesson: its title opens the player,
 * beside the signed thumbnail (desk only — a phone row needs the room for
 * its move buttons).
 *
 * DELETING names what goes: a section's delete says how many lessons go
 * with it. A deleted lesson's Stream video is deleted too.
 */
export type EditorSection = { id: string; title: string };
export type EditorLesson = {
  id: string;
  sectionId: string;
  title: string;
  durationSeconds: number | null;
  hasVideo: boolean;
  /** The lesson's player, so the admin can watch what she uploaded. */
  href: string;
  /** Signed, minted server-side for this viewer; null when there is no video yet. */
  thumbnailSrc: string | null;
};

const EMPTY: CourseState = { error: null, message: null };

function Rename({
  action,
  idField,
  id,
  title,
  label,
}: {
  action: (prev: CourseState, fd: FormData) => Promise<CourseState>;
  idField: string;
  id: string;
  title: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, EMPTY);
  const inputId = useId();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the editor once the save lands
    if (state.message) setOpen(false);
  }, [state]);
  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" className="max-lg:min-h-11" onClick={() => setOpen(true)}>
        Rename
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex w-full flex-wrap items-center gap-2">
      <input type="hidden" name={idField} value={id} />
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Input id={inputId} name="title" defaultValue={title} required maxLength={200} autoFocus className="min-w-0 flex-1" />
      <Button type="submit" size="sm" variant="secondary" className="max-lg:min-h-11" disabled={pending}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" className="max-lg:min-h-11" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <FormFeedback error={state.error} />
    </form>
  );
}

function MoveButtons({ onUp, onDown, first, last, name }: { onUp: () => void; onDown: () => void; first: boolean; last: boolean; name: string }) {
  return (
    <span className="flex shrink-0 gap-1 lg:hidden">
      <button
        type="button"
        onClick={onUp}
        disabled={first}
        aria-label={`Move ${name} up`}
        className="flex size-11 items-center justify-center rounded-control border border-ink/50 text-ink disabled:opacity-35"
      >
        <Icon name="chevron" className="size-4 -rotate-90" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={last}
        aria-label={`Move ${name} down`}
        className="flex size-11 items-center justify-center rounded-control border border-ink/50 text-ink disabled:opacity-35"
      >
        <Icon name="chevron" className="size-4 rotate-90" strokeWidth={2} />
      </button>
    </span>
  );
}

function Handle({ name, onKey, onDragStart }: { name: string; onKey: (e: KeyboardEvent<HTMLButtonElement>) => void; onDragStart: (e: DragEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onKeyDown={onKey}
      aria-label={`Reorder ${name}. Drag, or press the up and down arrow keys.`}
      className="hidden size-9 shrink-0 cursor-grab items-center justify-center rounded-control text-muted lg:flex lg:hover:bg-sunk active:cursor-grabbing"
    >
      <Icon name="grip" className="size-5" strokeWidth={3} />
    </button>
  );
}

export function CourseEditor({ courseId, sections: initialSections, lessons: initialLessons }: { courseId: string; sections: EditorSection[]; lessons: EditorLesson[] }) {
  const router = useRouter();
  const [sections, setSections] = useState(initialSections);
  const [lessons, setLessons] = useState(initialLessons);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const [dragging, setDragging] = useState<{ kind: "lesson" | "section"; id: string } | null>(null);
  const [addState, addAction, adding] = useActionState(createSection, EMPTY);

  // The server's truth replaces the local copy whenever it changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adopting fresh server props
    setSections(initialSections);
    setLessons(initialLessons);
  }, [initialSections, initialLessons]);

  const inSection = (sectionId: string, list = lessons) => list.filter((l) => l.sectionId === sectionId);

  const commitSectionOrder = (next: EditorSection[]) => {
    setSections(next);
    start(async () => {
      const { error } = await reorderSections(courseId, next.map((s) => s.id));
      setError(error);
      router.refresh();
    });
  };

  /** Put `lessonId` into `sectionId` at `index`, then send that section's whole order. */
  const placeLesson = (lessonId: string, sectionId: string, index: number) => {
    const moving = lessons.find((l) => l.id === lessonId);
    if (!moving) return;
    const rest = lessons.filter((l) => l.id !== lessonId);
    const target = inSection(sectionId, rest);
    const clamped = Math.max(0, Math.min(index, target.length));
    const newTarget = [...target.slice(0, clamped), { ...moving, sectionId }, ...target.slice(clamped)];
    const others = rest.filter((l) => l.sectionId !== sectionId);
    setLessons([...others, ...newTarget]);
    start(async () => {
      const { error } = await reorderSectionLessons(courseId, sectionId, newTarget.map((l) => l.id));
      setError(error);
      router.refresh();
    });
  };

  const moveSection = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    commitSectionOrder(next);
  };

  const dropOnSection = (sectionId: string, index: number) => (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const d = dragging;
    setDragging(null);
    if (!d) return;
    if (d.kind === "lesson") placeLesson(d.id, sectionId, index);
    if (d.kind === "section") {
      const from = sections.findIndex((s) => s.id === d.id);
      const to = sections.findIndex((s) => s.id === sectionId);
      if (from < 0 || to < 0 || from === to) return;
      const next = [...sections];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      commitSectionOrder(next);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}

      {sections.map((section, si) => {
        const own = inSection(section.id);
        return (
          <section
            key={section.id}
            onDragOver={(e) => dragging && e.preventDefault()}
            onDrop={dropOnSection(section.id, own.length)}
            className={`flex flex-col gap-2 border-t border-rule pt-3 ${dragging ? "lg:min-h-16" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Handle
                name={section.title}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDragging({ kind: "section", id: section.id });
                }}
                onKey={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault();
                    moveSection(si, e.key === "ArrowUp" ? -1 : 1);
                  }
                }}
              />
              <h3 className="min-w-0 flex-1 font-display text-title text-ink">{section.title}</h3>
              <span className="font-condensed text-label tabular-nums text-muted">
                {own.length} {own.length === 1 ? "lesson" : "lessons"}
              </span>
              <MoveButtons
                name={section.title}
                first={si === 0}
                last={si === sections.length - 1}
                onUp={() => moveSection(si, -1)}
                onDown={() => moveSection(si, 1)}
              />
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <Rename action={renameSection} idField="section_id" id={section.id} title={section.title} label={`New title for ${section.title}`} />
              <ConfirmDeleteForm
                action={deleteSection}
                fields={{ section_id: section.id }}
                name={
                  own.length === 0
                    ? `the section "${section.title}"`
                    : `the section "${section.title}" and its ${own.length} ${own.length === 1 ? "lesson" : "lessons"}`
                }
              />
            </div>

            <SectionVideoDrop sectionId={section.id} sectionTitle={section.title} />

            <ol className="flex flex-col">
              {own.map((lesson, li) => (
                <li
                  key={lesson.id}
                  onDragOver={(e) => dragging?.kind === "lesson" && e.preventDefault()}
                  onDrop={dropOnSection(section.id, li)}
                  className={`flex flex-col gap-2 border-b border-rule py-2.5 last:border-b-0 ${
                    dragging?.id === lesson.id ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Handle
                      name={lesson.title}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDragging({ kind: "lesson", id: lesson.id });
                      }}
                      onKey={(e) => {
                        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                          e.preventDefault();
                          placeLesson(lesson.id, section.id, li + (e.key === "ArrowUp" ? -1 : 1));
                        }
                      }}
                    />
                    <span className="w-6 shrink-0 font-condensed text-label tabular-nums text-muted">{li + 1}</span>
                    {lesson.thumbnailSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived Stream URL; nothing to optimise
                      <img
                        src={lesson.thumbnailSrc}
                        alt=""
                        className="hidden aspect-video w-16 shrink-0 rounded-control border border-rule bg-sunk object-cover lg:block"
                      />
                    ) : (
                      <span aria-hidden="true" className="hidden aspect-video w-16 shrink-0 rounded-control border border-rule bg-sunk lg:block" />
                    )}
                    <Link
                      href={lesson.href}
                      className="min-w-0 flex-1 text-body text-ink underline-offset-4 max-lg:py-2 lg:hover:underline"
                    >
                      {lesson.title}
                    </Link>
                    <span className="shrink-0 font-condensed text-label tabular-nums text-muted">
                      {lesson.hasVideo ? formatDuration(lesson.durationSeconds) : "No video"}
                    </span>
                    <MoveButtons
                      name={lesson.title}
                      first={li === 0}
                      last={li === own.length - 1}
                      onUp={() => placeLesson(lesson.id, section.id, li - 1)}
                      onDown={() => placeLesson(lesson.id, section.id, li + 1)}
                    />
                  </div>
                  <div className="flex flex-wrap items-start gap-2 pl-8 lg:pl-[8.75rem]">
                    <Rename action={renameLesson} idField="lesson_id" id={lesson.id} title={lesson.title} label={`New title for ${lesson.title}`} />
                    <ConfirmDeleteForm action={deleteLesson} fields={{ lesson_id: lesson.id }} name={`the lesson "${lesson.title}" and its video`} />
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}

      <form action={addAction} className="flex flex-wrap items-end gap-2 border-t border-rule pt-4">
        <input type="hidden" name="course_id" value={courseId} />
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-label font-medium text-ink">
          New section
          <Input name="title" required maxLength={200} />
        </label>
        <Button type="submit" variant="secondary" arrow={false} disabled={adding}>
          Add section
        </Button>
        <FormFeedback error={addState.error} />
      </form>
    </div>
  );
}
