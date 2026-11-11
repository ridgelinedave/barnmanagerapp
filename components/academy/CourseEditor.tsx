"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormFeedback, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { OverflowMenu, type MenuItem } from "@/components/ui/OverflowMenu";
import { ConfirmDeleteForm } from "@/components/ConfirmDelete";
import { AddVideosButton, dragHasFiles, isVideoFile, useAddVideos } from "@/components/academy/SectionVideoDrop";
import { useUploadQueue } from "@/components/academy/UploadQueue";
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
 * The admin's curriculum for one course: sections and their lessons
 * (David's UI pass, 2026-11-11 — the function is unchanged, the look is not).
 *
 * A SECTION is a white panel (1px line, radius 6, no shadow). Its header is
 * one line: drag handle, the title (click it to rename in place), the lesson
 * count, and a ⋯ menu (Rename, Delete section). A LESSON is one line: handle,
 * number, a 64px 16:9 signed thumbnail, the title (opens the player), the
 * duration in tabular figures, and a ⋯ menu (Rename, Replace video, Delete).
 * Nothing sits beneath a row. DELETE lives only in the ⋯ menus, in red text,
 * and leads to the app's inline confirm (ConfirmDelete) — Keep first.
 *
 * ADDING VIDEOS: a quiet "+ Add videos" at the foot of each section. The
 * dashed drop zone appears only while files are dragged, over the section
 * they will land in. "+ Add section" once, at the bottom; a new section is
 * "Section N" until it is renamed.
 *
 * REORDERING. On the desk: drag a lesson by its handle (within a section or
 * into another one) or a section by its handle; the handle also takes
 * ArrowUp / ArrowDown for a keyboard. On a phone: Move up / Move down in the
 * ⋯ menu. Every reorder sends the COMPLETE new order to the database
 * (whole-list rewrite, 0028), shows it at once and then settles from the
 * server.
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

type Target = { kind: "section" | "lesson"; id: string } | null;

const EMPTY: CourseState = { error: null, message: null };

/** Rename in place: the title becomes a field. Enter saves, Escape cancels. */
function InlineRename({
  action,
  idField,
  id,
  title,
  label,
  onDone,
  display = false,
}: {
  action: (prev: CourseState, fd: FormData) => Promise<CourseState>;
  idField: string;
  id: string;
  title: string;
  label: string;
  onDone: () => void;
  /** A section title: the field reads in the display face. */
  display?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  const inputId = useId();
  useEffect(() => {
    if (state.message) onDone();
  }, [state, onDone]);
  return (
    <form action={formAction} className="flex min-w-0 flex-1 flex-wrap items-center gap-2 py-1">
      <input type="hidden" name={idField} value={id} />
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Input
        id={inputId}
        name="title"
        defaultValue={title}
        required
        maxLength={200}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onDone();
          }
        }}
        className={`min-w-0 flex-1 ${display ? "font-display text-title" : ""}`}
      />
      <span className="flex gap-1">
        <Button type="submit" variant="secondary" arrow={false} disabled={pending}>
          Save
        </Button>
        <Button type="button" variant="ghost" arrow={false} onClick={onDone}>
          Cancel
        </Button>
      </span>
      <FormFeedback error={state.error} />
    </form>
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
      className="hidden size-11 shrink-0 cursor-grab items-center justify-center rounded-control text-muted hover:bg-sunk hover:text-ink active:cursor-grabbing lg:flex"
    >
      <Icon name="grip" className="size-5" strokeWidth={3} />
    </button>
  );
}

const lessonsWord = (n: number) => `${n} ${n === 1 ? "lesson" : "lessons"}`;

export function CourseEditor({ courseId, sections: initialSections, lessons: initialLessons }: { courseId: string; sections: EditorSection[]; lessons: EditorLesson[] }) {
  const router = useRouter();
  const [sections, setSections] = useState(initialSections);
  const [lessons, setLessons] = useState(initialLessons);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const [dragging, setDragging] = useState<{ kind: "lesson" | "section"; id: string } | null>(null);
  const [renaming, setRenaming] = useState<Target>(null);
  const [deleting, setDeleting] = useState<Target>(null);
  const [addState, addAction, adding] = useActionState(createSection, EMPTY);
  const renameHint = useId();

  // The server's truth replaces the local copy whenever it changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adopting fresh server props
    setSections(initialSections);
    setLessons(initialLessons);
  }, [initialSections, initialLessons]);

  // Files dropped anywhere but a section must not make the browser open the
  // video in place of the page (and lose the editor).
  useEffect(() => {
    const guard = (e: globalThis.DragEvent) => {
      if (dragHasFiles(e)) e.preventDefault();
    };
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => {
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
  }, []);

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

  const dropInternal = (sectionId: string, index: number) => (e: DragEvent) => {
    const d = dragging;
    if (!d || dragHasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(null);
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

  const stopEditing = () => setRenaming(null);

  return (
    <div className="flex flex-col gap-4">
      <span id={renameHint} hidden>
        Rename
      </span>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}

      {sections.map((section, si) => {
        const own = inSection(section.id);
        return (
          <SectionPanel
            key={section.id}
            section={section}
            count={own.length}
            dragging={dragging}
            onInternalDrop={dropInternal(section.id, own.length)}
            header={
              <div className="flex min-h-14 items-center gap-1 py-1.5 pl-1 pr-1.5 lg:gap-2">
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
                {renaming?.kind === "section" && renaming.id === section.id ? (
                  <InlineRename
                    action={renameSection}
                    idField="section_id"
                    id={section.id}
                    title={section.title}
                    label={`New title for ${section.title}`}
                    onDone={stopEditing}
                    display
                  />
                ) : (
                  <>
                    <h3 className="min-w-0 flex-1">
                      {/* Named by the title alone (a heading reads as itself);
                          "Rename" is its description. */}
                      <button
                        type="button"
                        aria-describedby={renameHint}
                        onClick={() => setRenaming({ kind: "section", id: section.id })}
                        className="flex min-h-11 w-full items-center rounded-control px-2 text-left font-display text-title text-ink break-words hover:bg-sunk max-lg:pl-3"
                      >
                        {section.title}
                      </button>
                    </h3>
                    <span className="shrink-0 font-condensed text-label tabular-nums text-muted">{lessonsWord(own.length)}</span>
                  </>
                )}
                <OverflowMenu
                  label={`Actions for ${section.title}`}
                  items={[
                    { label: "Rename", onSelect: () => setRenaming({ kind: "section", id: section.id }) },
                    ...(si > 0 ? [{ label: "Move up", hideFrom: "lg" as const, onSelect: () => moveSection(si, -1) }] : []),
                    ...(si < sections.length - 1 ? [{ label: "Move down", hideFrom: "lg" as const, onSelect: () => moveSection(si, 1) }] : []),
                    { label: "Delete section", danger: true, onSelect: () => setDeleting({ kind: "section", id: section.id }) },
                  ]}
                />
              </div>
            }
          >
            {deleting?.kind === "section" && deleting.id === section.id && (
              <div className="border-t border-line px-3 py-3">
                <ConfirmDeleteForm
                  action={deleteSection}
                  fields={{ section_id: section.id }}
                  startAsking
                  onKeep={() => setDeleting(null)}
                  name={
                    own.length === 0
                      ? `the section "${section.title}"`
                      : `the section "${section.title}" and its ${lessonsWord(own.length)}`
                  }
                />
              </div>
            )}

            {own.length === 0 ? (
              <p className="border-t border-line px-4 pt-3 text-caption text-muted">No lessons yet</p>
            ) : (
              <ol className="flex flex-col border-t border-line">
                {own.map((lesson, li) => (
                  <LessonRow
                    key={lesson.id}
                    lesson={lesson}
                    number={li + 1}
                    sectionTitle={section.title}
                    faded={dragging?.id === lesson.id}
                    renaming={renaming?.kind === "lesson" && renaming.id === lesson.id}
                    deleting={deleting?.kind === "lesson" && deleting.id === lesson.id}
                    onRename={() => setRenaming({ kind: "lesson", id: lesson.id })}
                    onRenameDone={stopEditing}
                    onDelete={() => setDeleting({ kind: "lesson", id: lesson.id })}
                    onKeep={() => setDeleting(null)}
                    onMove={li > 0 || li < own.length - 1 ? (delta) => placeLesson(lesson.id, section.id, li + delta) : null}
                    canUp={li > 0}
                    canDown={li < own.length - 1}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      setDragging({ kind: "lesson", id: lesson.id });
                    }}
                    onDragOver={(e) => dragging?.kind === "lesson" && e.preventDefault()}
                    onDrop={dropInternal(section.id, li)}
                    onKey={(e) => {
                      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                        e.preventDefault();
                        placeLesson(lesson.id, section.id, li + (e.key === "ArrowUp" ? -1 : 1));
                      }
                    }}
                  />
                ))}
              </ol>
            )}
          </SectionPanel>
        );
      })}

      <form action={addAction} className="flex flex-col gap-1">
        <input type="hidden" name="course_id" value={courseId} />
        <input type="hidden" name="title" value={`Section ${sections.length + 1}`} />
        <button
          type="submit"
          disabled={adding}
          className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-control px-2 text-[0.9375rem] font-semibold text-accent-text underline-offset-4 hover:underline disabled:opacity-50"
        >
          <Icon name="plus" className="size-4 shrink-0" strokeWidth={2.25} />
          Add section
        </button>
        <FormFeedback error={addState.error} />
      </form>
    </div>
  );
}

/**
 * One section's panel. Owns the file-drop target: the dashed zone shows only
 * while files from the computer are dragged over THIS section.
 */
function SectionPanel({
  section,
  count,
  dragging,
  onInternalDrop,
  header,
  children,
}: {
  section: EditorSection;
  count: number;
  dragging: { kind: "lesson" | "section"; id: string } | null;
  onInternalDrop: (e: DragEvent) => void;
  header: ReactNode;
  children: ReactNode;
}) {
  const { enabled, add, skipped } = useAddVideos(section.id, section.title);
  const [filesOver, setFilesOver] = useState(false);
  const depth = useRef(0);

  return (
    <section
      aria-label={section.title}
      onDragEnter={(e) => {
        if (!enabled || !dragHasFiles(e)) return;
        depth.current += 1;
        setFilesOver(true);
      }}
      onDragLeave={(e) => {
        if (!enabled || !dragHasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setFilesOver(false);
      }}
      onDragOver={(e) => {
        if (enabled && dragHasFiles(e)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        } else if (dragging) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        if (enabled && dragHasFiles(e)) {
          e.preventDefault();
          depth.current = 0;
          setFilesOver(false);
          add(e.dataTransfer.files);
          return;
        }
        onInternalDrop(e);
      }}
      className="relative rounded-[6px] border border-line bg-surface"
    >
      {header}
      {children}
      {enabled && (
        <div className={`flex flex-col gap-1 px-2 pb-1.5 ${count === 0 ? "pt-0.5" : "border-t border-line pt-1.5"}`}>
          <AddVideosButton sectionTitle={section.title} onFiles={add} />
          {skipped.length > 0 && (
            <p role="status" className="px-2 pb-1 text-caption text-ink">
              Not a video, so not added: {skipped.join(", ")}.
            </p>
          )}
        </div>
      )}
      {filesOver && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-[4px] border-2 border-dashed border-accent bg-accent-tint/95 px-4 text-center text-[0.9375rem] font-semibold text-accent-text"
        >
          Drop to add to {section.title}
        </div>
      )}
    </section>
  );
}

function LessonRow({
  lesson,
  number,
  sectionTitle,
  faded,
  renaming,
  deleting,
  onRename,
  onRenameDone,
  onDelete,
  onKeep,
  onMove,
  canUp,
  canDown,
  onDragStart,
  onDragOver,
  onDrop,
  onKey,
}: {
  lesson: EditorLesson;
  number: number;
  sectionTitle: string;
  faded: boolean;
  renaming: boolean;
  deleting: boolean;
  onRename: () => void;
  onRenameDone: () => void;
  onDelete: () => void;
  onKeep: () => void;
  onMove: ((delta: number) => void) | null;
  canUp: boolean;
  canDown: boolean;
  onDragStart: (e: DragEvent<HTMLButtonElement>) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onKey: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const queue = useUploadQueue();
  const fileRef = useRef<HTMLInputElement>(null);

  const items: MenuItem[] = [
    { label: "Rename", onSelect: onRename },
    ...(queue ? [{ label: lesson.hasVideo ? "Replace video" : "Add video", onSelect: () => fileRef.current?.click() }] : []),
    ...(onMove && canUp ? [{ label: "Move up", hideFrom: "lg" as const, onSelect: () => onMove(-1) }] : []),
    ...(onMove && canDown ? [{ label: "Move down", hideFrom: "lg" as const, onSelect: () => onMove(1) }] : []),
    { label: "Delete", danger: true, onSelect: onDelete },
  ];

  return (
    <li onDragOver={onDragOver} onDrop={onDrop} className={`border-b border-line last:border-b-0 ${faded ? "opacity-50" : ""}`}>
      <div className="flex min-h-14 items-center gap-2 py-1.5 pl-2 pr-1.5 lg:pl-1">
        <Handle name={lesson.title} onDragStart={onDragStart} onKey={onKey} />
        <span className="w-5 shrink-0 text-right font-condensed text-label tabular-nums text-muted">{number}</span>
        {lesson.thumbnailSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived Stream URL; nothing to optimise
          <img
            src={lesson.thumbnailSrc}
            alt=""
            className="aspect-video w-16 shrink-0 rounded-[4px] border border-line bg-sunk object-cover max-[359px]:hidden"
          />
        ) : (
          <span aria-hidden="true" className="aspect-video w-16 shrink-0 rounded-[4px] border border-line bg-sunk max-[359px]:hidden" />
        )}
        {renaming ? (
          <InlineRename
            action={renameLesson}
            idField="lesson_id"
            id={lesson.id}
            title={lesson.title}
            label={`New title for ${lesson.title}`}
            onDone={onRenameDone}
          />
        ) : (
          <>
            <Link
              href={lesson.href}
              className="flex min-h-11 min-w-0 flex-1 items-center text-body leading-snug text-ink underline-offset-4 hover:underline"
            >
              <span className="line-clamp-2 lg:line-clamp-1">{lesson.title}</span>
            </Link>
            <span className="shrink-0 font-condensed text-label tabular-nums text-muted">
              {lesson.hasVideo ? formatDuration(lesson.durationSeconds) : "No video"}
            </span>
          </>
        )}
        <OverflowMenu label={`Actions for ${lesson.title}`} items={items} />
        {queue && (
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file && isVideoFile(file)) {
                queue.replace({ id: lesson.id, title: lesson.title, sectionId: lesson.sectionId, sectionTitle }, file);
              }
            }}
          />
        )}
      </div>
      {deleting && (
        <div className="px-3 pb-3">
          <ConfirmDeleteForm
            action={deleteLesson}
            fields={{ lesson_id: lesson.id }}
            startAsking
            onKeep={onKeep}
            name={`the lesson "${lesson.title}" and its video`}
          />
        </div>
      )}
    </li>
  );
}
