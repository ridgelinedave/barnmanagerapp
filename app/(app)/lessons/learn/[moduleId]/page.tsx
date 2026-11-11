import { notFound, redirect } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { CourseCover, ProgressBar } from "@/components/academy/CourseCard";
import { CourseOutline } from "@/components/academy/CourseOutline";
import { CourseEditor } from "@/components/academy/CourseEditor";
import { CourseForm } from "@/components/academy/CourseForm";
import { Button, ButtonLink } from "@/components/ui/Button";
import { SheetTrigger } from "@/components/ui/Sheet";
import { SectionHeader } from "@/components/ui/primitives";
import { ListRow, RowList } from "@/components/ui/ListRow";
import { requireTab } from "@/lib/guard";
import { hasAcademyAccess } from "@/lib/academy-gate";
import { courseLearners, fillLessonDurations, listCategories, loadCourse } from "@/lib/academy";
import { outlineSummary, totalSeconds } from "@/lib/academy-format";
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
 * One course.
 *
 * A MEMBER (and the admin's "Preview as member") gets Circle's course page:
 * the cover, the description, progress, ONE primary action (Start / Continue
 * / Watch again) and the outline — no authoring.
 *
 * THE ADMIN gets an AUTHORING page (David's UI pass, 2026-11-11): the header
 * carries the title, a Draft / Published pill, and Preview as member (text),
 * Edit details (secondary), Publish (the one primary). A narrow left rail has
 * the cover, description, categories, one totals line and Who is watching;
 * the wide right column is the curriculum (CourseEditor). Start and Enroll are
 * not here — they belong to the member view, which Preview shows. On a phone
 * the header is the oxblood bar, so the pill and the three actions open the
 * body instead, and Who is watching follows the curriculum.
 *
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
  // No Academy access (0032): no Academy. RLS would return nothing anyway.
  if (!(await hasAcademyAccess())) redirect("/lessons");
  if (!featureEnabled("learning")) notFound();
  const { moduleId } = await params;
  const isAdmin = role === "admin";
  // "Preview as member" (Circle's View as student): the admin sees the page
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

  if (editing) {
    // Who a published course reaches — the rule in learning_audience_allows
    // (0032), in words: Academy access first, then the course's audience.
    const levelName = levels.find((l) => l.id === course.audienceLevelId)?.name;
    const tagName = tags.find((t) => t.id === course.audienceTagId)?.name;
    const audienceSentence =
      course.audience === "level"
        ? `People with Academy access and an active rider at ${levelName ?? "the chosen level"}`
        : course.audience === "tag"
          ? `People with Academy access who are tagged “${tagName ?? "the chosen tag"}”`
          : "Everyone with Academy access";

    const categoryNames = categories.filter((c) => course.categoryIds.includes(c.id)).map((c) => c.name);
    const totals = outlineSummary(sections.length, lessons.length, totalSeconds(lessons));

    const statusPill = (
      <span
        className={`inline-flex rounded-chip border px-1.5 py-0.5 font-condensed text-micro uppercase ${
          course.published ? "border-forest/70 text-forest" : "border-muted/60 text-muted"
        }`}
      >
        {course.published ? "Published" : "Draft"}
      </span>
    );

    const preview = (
      <ButtonLink href={`/lessons/learn/${course.id}?view=member`} variant="ghost" arrow={false}>
        Preview as member
      </ButtonLink>
    );
    const editDetails = (
      <SheetTrigger label="Edit details" title={`Edit — ${course.title}`}>
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
    );
    const publish = (
      <PublishControl
        courseId={course.id}
        title={course.title}
        published={course.published}
        audience={audienceSentence}
        lessonCount={course.lessonCount}
      />
    );

    // Rows, not a table, at every width: the rail is 18-20rem, and a
    // three-column table in it wraps every cell.
    const watching = (
      <section className="flex flex-col gap-3">
        <SectionHeader title="Who is watching" count={learners.length ? `${learners.length}` : undefined} />
        {learners.length === 0 ? (
          <p className="text-caption text-muted">Nobody yet</p>
        ) : (
          <RowList>
            {learners.map((l) => (
              <ListRow
                key={l.profileId}
                title={l.name}
                meta={[`${l.completed} of ${l.total} · ${l.percent}%`, l.lastCompletedAt ? `last ${formatBarnDate(new Date(l.lastCompletedAt))}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </RowList>
        )}
      </section>
    );

    return (
      <TabPage
        title={course.title}
        back="/lessons/learn"
        layout="split"
        split="authoring"
        density="normal"
        lead={
          <>
            <CourseBanner src={course.coverSrc} title={course.title} />
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3 lg:justify-start">
                <BannerTitle title={course.title} />
                {statusPill}
                {/* Phone: Preview shares the status row. */}
                <span className="lg:hidden">{preview}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="hidden lg:inline-flex">{preview}</span>
                {/* One primary: Publish. On a phone it leads the row. */}
                <span className="order-2 lg:order-none">{editDetails}</span>
                <span className="order-1 lg:order-none">{publish}</span>
              </div>
            </div>
          </>
        }
        detail={
          <>
            <section className="flex flex-col gap-3">
              <SectionHeader title="Curriculum" />
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
            {/* Phone: who is watching follows the curriculum. */}
            <div className="lg:hidden">{watching}</div>
          </>
        }
      >
        {course.description && <p className="whitespace-pre-line text-body leading-relaxed text-ink">{course.description}</p>}
        {categoryNames.length > 0 && (
          <ul aria-label="Categories" className="flex flex-wrap gap-1.5">
            {categoryNames.map((name) => (
              <li key={name} className="rounded-chip bg-accent-tint px-2 py-0.5 text-label text-accent-text">
                {name}
              </li>
            ))}
          </ul>
        )}
        <p className="font-condensed text-label tabular-nums text-muted">{totals}</p>
        <div className="hidden lg:block">{watching}</div>
      </TabPage>
    );
  }

  // --- the member's page (and the admin's preview of it) ---------------------
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
  const label = course.percent >= 100 ? "Watch again" : course.completed > 0 ? "Continue" : "Start";

  // An empty section is the admin's work in progress, not the member's.
  const outlineNode = <CourseOutline sections={outline.filter((s) => s.lessons.length > 0)} />;
  const description = course.description ? (
    <p className="whitespace-pre-line text-body leading-relaxed text-ink">{course.description}</p>
  ) : null;

  return (
    <TabPage
      title={course.title}
      back="/lessons/learn"
      layout="split"
      density="normal"
      lead={
        <>
          {previewing && (
            <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-rule bg-surface px-3 py-2">
              <span className="min-w-0 flex-1 text-caption text-ink">
                Preview: this is what a member sees{course.published ? "" : " once it's published"}.
              </span>
              <ButtonLink href={`/lessons/learn/${course.id}`} variant="ghost" arrow={false}>
                Back to editing
              </ButtonLink>
            </div>
          )}
          <CourseBanner src={course.coverSrc} title={course.title} />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
            <div className="hidden min-w-0 flex-1 items-center lg:flex">
              <BannerTitle title={course.title} />
            </div>
            {course.lessonCount > 0 && (
              // ONE primary: Start / Continue / Watch again. Enroll is a text button.
              <div className="flex flex-wrap items-center gap-2">
                {course.continueLessonId && (
                  <ButtonLink href={lessonHref(course.continueLessonId)} variant="primary">
                    {label}
                  </ButtonLink>
                )}
                {!course.enrolled && (
                  <form action={enrolInCourse}>
                    <input type="hidden" name="module_id" value={course.id} />
                    <Button type="submit" variant="ghost" arrow={false}>
                      Enroll
                    </Button>
                  </form>
                )}
              </div>
            )}
          </div>
          {course.enrolled && course.lessonCount > 0 && (
            <div className="lg:max-w-md">
              <ProgressBar percent={course.percent} label={`${course.title} progress`} />
            </div>
          )}
        </>
      }
      // Description on the left, the outline on the right; with no
      // description, the outline is the page.
      detail={description ? outlineNode : undefined}
    >
      {description ?? outlineNode}
    </TabPage>
  );
}

/**
 * The course cover as a banner across the content area: the same 16:9 image,
 * cropped (object-cover, never stretched) to a wide band — about 4:1 on the
 * desk, the full 16:9 on a phone.
 */
function CourseBanner({ src, title }: { src: string | null; title: string }) {
  return <CourseCover src={src} title={title} className="lg:aspect-[4/1]" />;
}

/**
 * The title under the banner, on the desk. The page's h1 is in the header —
 * screen-reader-only there on the desk (TabPage `lead`), and the visible
 * title on a phone, where the oxblood bar shows it — so this one is
 * presentation only, never a second heading.
 */
function BannerTitle({ title }: { title: string }) {
  return (
    <p aria-hidden="true" className="hidden min-w-0 font-display text-[1.75rem] leading-tight text-ink lg:block">
      {title}
    </p>
  );
}
