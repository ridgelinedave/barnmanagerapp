"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { outlineSummary } from "@/lib/academy-format";
import { AcademyLessonRow, type AcademyLessonRowProps } from "@/components/academy/AcademyLessonRow";

/**
 * A course's sections and lessons — Circle's course page structure:
 * "N sections · M lessons", Expand all / Collapse all, collapsible sections
 * each showing their lesson count, lesson rows beneath.
 *
 * Each section header is a disclosure button (aria-expanded, 44px+), the
 * section title in Marcellus, the count in Barlow Condensed. Opens on the
 * section holding the current (or next) lesson, else the first, unless told
 * otherwise. The same component is the player's side list (`compact`).
 */
export type OutlineSection = {
  id: string;
  title: string;
  lessons: AcademyLessonRowProps[];
};

export function CourseOutline({
  sections,
  initiallyOpen,
  compact = false,
  heading,
}: {
  sections: OutlineSection[];
  /** Section ids open on first render. Default: the one with the current lesson, else the first. */
  initiallyOpen?: string[];
  /** The player's side list: no summary line, tighter header. */
  compact?: boolean;
  /** Optional heading over the outline (the course title in the player). */
  heading?: string;
}) {
  const fallback = sections.find((s) => s.lessons.some((l) => l.current))?.id ?? sections[0]?.id;
  const [open, setOpen] = useState<Set<string>>(() => new Set(initiallyOpen ?? (fallback ? [fallback] : [])));
  const baseId = useId();
  const total = sections.reduce((n, s) => n + s.lessons.length, 0);
  const allOpen = sections.length > 0 && sections.every((s) => open.has(s.id));

  const toggle = (id: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      {(heading || !compact) && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {heading && <h2 className="min-w-0 flex-1 font-display text-title text-ink">{heading}</h2>}
          {!compact && (
            <p className="min-w-0 flex-1 font-condensed text-label font-medium uppercase tracking-[0.08em] text-muted">
              {outlineSummary(sections.length, total)}
            </p>
          )}
          {sections.length > 1 && (
            <button
              type="button"
              onClick={() => setOpen(allOpen ? new Set() : new Set(sections.map((s) => s.id)))}
              className="-my-2 flex min-h-11 items-center font-condensed text-label font-semibold uppercase tracking-[0.08em] text-accent-text underline-offset-4 lg:hover:underline"
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col">
        {sections.map((section) => {
          const isOpen = open.has(section.id);
          const bodyId = `${baseId}-${section.id}`;
          const done = section.lessons.filter((l) => l.completed).length;
          return (
            <section key={section.id} className="border-t border-rule">
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={bodyId}
                  onClick={() => toggle(section.id)}
                  className={`flex w-full items-center gap-3 text-left ${compact ? "min-h-11 py-2" : "min-h-14 py-3"}`}
                >
                  <span className={`min-w-0 flex-1 font-display leading-snug text-ink ${compact ? "text-heading" : "text-title"}`}>
                    {section.title}
                  </span>
                  <span className="shrink-0 font-condensed text-label font-medium tabular-nums text-muted">
                    {done > 0 ? `${done} / ${section.lessons.length}` : `${section.lessons.length} ${section.lessons.length === 1 ? "lesson" : "lessons"}`}
                  </span>
                  <Icon
                    name="chevron"
                    className={`size-4 shrink-0 text-muted transition-transform duration-150 ${isOpen ? "-rotate-90" : "rotate-90"}`}
                  />
                </button>
              </h3>
              <div id={bodyId} hidden={!isOpen}>
                {section.lessons.length === 0 ? (
                  <p className="pb-3 text-caption text-muted">No lessons yet</p>
                ) : (
                  <ul className="flex flex-col pb-2">
                    {section.lessons.map((lesson) => (
                      <AcademyLessonRow key={lesson.id} {...lesson} />
                    ))}
                  </ul>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
