import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { CourseCover, ProgressBar } from "@/components/academy/CourseCard";
import { CourseOutline } from "@/components/academy/CourseOutline";
import { CourseEditor } from "@/components/academy/CourseEditor";
import { CourseForm } from "@/components/academy/CourseForm";
import { Button, ButtonLink } from "@/components/ui/Button";
import { SheetTrigger } from "@/components/ui/Sheet";
import { SectionHeader } from "@/components/ui/primitives";
import { DataTable, DESKTOP_ONLY, MOBILE_ONLY, type Column, type Row } from "@/components/ui/DataTable";
import { ListRow, RowList } from "@/components/ui/ListRow";
import { requireTab } from "@/lib/guard";
import { courseLearners, fillLessonDurations, listCategories, loadCourse } from "@/lib/academy";
import { listLevels } from "@/lib/lessons";
import { listTags } from "@/lib/tags";
import { streamThumbnails } from "@/lib/stream";
import { formatBarnDate } from "@/lib/dates";
import { barn, featureEnabled } from "@/config/barn";
import { PublishControl } from "@/components/academy/PublishControl";
import { enrolInCourse, setLessonComplete } from "../course-actions";

export const metadata = { title: barn.learning.label };
export const dynamic = "force-dynamic";

/**
 * One course — Circle's course page structure: the cover, "N sections ·
 * M lessons", Expand all / Collapse all, collapsible sections with lesson
 * counts, and lesson rows with a completion circle, a SIGNED thumbnail, the
 * title and the duration.
 *
 * The admin gets the same page with the authoring in place of the outline:
 * Draft / Publish, Edit (title, description, 16:9 cover, categories,
 * audience), the outline editor (sections and lessons: add, rename, delete,
 * reorder, upload — each lesson row opens its player) and who is watching.
 * A member never reaches a draft: RLS does not return it, and this page 404s.
 */
export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ moduleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const role = await requireTab("/lessons");
  if (!featureEnabled("learning")) notFound();
  const { moduleId } = await params;
  const isAdmin = role === "admin";
  // "Preview as a member" (Circle's View as student): the admin sees the page
  // a member sees — outline, Start, no authoring — with a way back.
  const previewing = isAdmin && (await searchParams).view === "member";
  const editing = isAdmin && !previewing;

  let loaded = await loadCourse(moduleId);
  if (!loaded) notFound();

  // Admin: pick up Stream durations for anything still processing, so a
  // freshly uploaded lesson reads its length here without a separate step.
  if (isAdmin) {
    const pending = loaded.lessons.filter((l) => l.videoId && !l.durationSeconds).map((l) => l.id);
    if (pending.length) {
      const { changed } = await fillLessonDurations(pending);
      if (changed) loaded = (await loadCourse(moduleId)) ?? loaded;
    }
  }
  const { course, sections, lessons, completedIds } = loaded;

  const [thumbs, categories, levels, learners, tags] = await Promise.all([
    streamThumbnails(lessons.map((l) => l.videoId).filter((v): v is string => Boolean(v))),
    isAdmin ? listCategories() : Promise.resolve([]),
    isAdmin ? listLevels() : Promise.resolve([]),
    isAdmin ? courseLearners(course.id) : Promise.resolve([]),
    isAdmin ? listTags() : Promise.resolve([]),
  ]);

  const lessonHref = (id: string) => `/lessons/learn/${course.id}/${id}`;
  const thumbFor = (videoId: string | null) => (videoId ? (thumbs.get(videoId) ?? null) : null);
  const outline = sections.map((s) => ({
    id: s.id,
    title: s.title,
    lessons: lessons
      .filter((l) => l.sectionId === s.id)
      .map((l) => ({
        id: l.id,
        title: l.title,
        href: lessonHref(l.id),
        durationSeconds: l.durationSeconds,
        thumbnailSrc: thumbFor(l.videoId),
        completed: completedIds.has(l.id),
        toggleAction: setLessonComplete,
      })),
  }));
  // Who a published course reaches — the rule in learning_audience_allows
  // (0023), in words: staff always; clients by the course's audience.
  const levelName = levels.find((l) => l.id === course.audienceLevelId)?.name;
  const tagName = tags.find((t) => t.id === course.audienceTagId)?.name;
  const audienceSentence =
    course.audience === "level"
      ? `All staff, and clients with an active rider at ${levelName ?? "the chosen level"},`
      : course.audience === "tag"
        ? `All staff, and people tagged “${tagName ?? "the chosen tag"}”,`
        : "All staff and every client";
  const label = course.percent >= 100 ? "Watch again" : course.completed > 0 ? "Continue" : "Start";

  const learnerColumns: Column[] = [
    { key: "name", label: "Member" },
    { key: "progress", label: "Progress", numeric: true },
    { key: "last", label: "Last lesson completed" },
  ];
  const learnerRows: Row[] = learners.map((l) => ({
    key: l.profileId,
    cells: {
      name: l.name,
      progress: `${l.completed} of ${l.total} · ${l.percent}%`,
      last: l.lastCompletedAt ? formatBarnDate(new Date(l.lastCompletedAt)) : "—",
    },
  }));

  return (
    <TabPage
      title={course.title}
      back="/lessons/learn"
      layout="split"
      density="normal"
      detail={
        editing ? (
          <section className="flex flex-col gap-3">
            <SectionHeader title="Sections and lessons" />
            <CourseEditor
              courseId={course.id}
              sections={sections.map((s) => ({ id: s.id, title: s.title }))}
              lessons={lessons.map((l) => ({
                id: l.id,
                sectionId: l.sectionId,
                title: l.title,
                durationSeconds: l.durationSeconds,
                hasVideo: Boolean(l.videoId),
                href: lessonHref(l.id),
                thumbnailSrc: thumbFor(l.videoId),
              }))}
            />
          </section>
        ) : (
          // An empty section is the admin's work in progress, not the member's.
          <CourseOutline sections={outline.filter((s) => s.lessons.length > 0)} />
        )
      }
    >
      {previewing && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-rule bg-surface px-3 py-2">
          <span className="min-w-0 flex-1 text-caption text-ink">
            Preview: this is what a member sees{course.published ? "" : " once it's published"}.
          </span>
          <ButtonLink href={`/lessons/learn/${course.id}`} variant="secondary" size="sm" arrow={false}>
            Back to editing
          </ButtonLink>
        </div>
      )}

      <CourseCover src={course.coverSrc} title={course.title} />

      {editing && (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-chip border px-1.5 py-0.5 font-condensed text-micro uppercase ${
              course.published ? "border-forest/70 text-forest" : "border-muted/60 text-muted"
            }`}
          >
            {course.published ? "Published" : "Draft"}
          </span>
          <PublishControl
            courseId={course.id}
            title={course.title}
            published={course.published}
            audience={audienceSentence}
            lessonCount={course.lessonCount}
          />
          <SheetTrigger label="Edit course" title={`Edit — ${course.title}`}>
            <CourseForm
              course={{
                id: course.id,
                title: course.title,
                description: course.description,
                audience: course.audience,
                audienceLevelId: course.audienceLevelId,
                audienceTagId: course.audienceTagId,
                categoryIds: course.categoryIds,
              }}
              coverSrc={course.coverSrc}
              categories={categories}
              levels={levels.map((l) => ({ id: l.id, name: l.name }))}
              tags={tags.map((t) => ({ id: t.id, name: t.name }))}
            />
          </SheetTrigger>
          <ButtonLink href={`/lessons/learn/${course.id}?view=member`} variant="ghost" arrow={false}>
            Preview as a member
          </ButtonLink>
        </div>
      )}

      {course.description && <p className="whitespace-pre-line text-body leading-relaxed text-ink">{course.description}</p>}

      {course.lessonCount > 0 && (
        <div className="flex flex-col gap-3">
          {course.enrolled && <ProgressBar percent={course.percent} label={`${course.title} progress`} />}
          <div className="flex flex-wrap gap-2">
            {course.continueLessonId && (
              <ButtonLink href={lessonHref(course.continueLessonId)} variant="primary">
                {label}
              </ButtonLink>
            )}
            {!course.enrolled && (
              <form action={enrolInCourse}>
                <input type="hidden" name="module_id" value={course.id} />
                <Button type="submit" variant="secondary" arrow={false}>
                  Enroll
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      {editing && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Who is watching" count={learners.length ? `${learners.length}` : undefined} />
          {learners.length === 0 ? (
            <p className="text-caption text-muted">Nobody yet</p>
          ) : (
            <>
              <div className={MOBILE_ONLY}>
                <RowList>
                  {learners.map((l) => (
                    <ListRow key={l.profileId} title={l.name} meta={`${l.completed} of ${l.total} · ${l.percent}%`} />
                  ))}
                </RowList>
              </div>
              <div className={DESKTOP_ONLY}>
                <DataTable caption="Who is watching" columns={learnerColumns} rows={learnerRows} />
              </div>
            </>
          )}
        </section>
      )}
    </TabPage>
  );
}
