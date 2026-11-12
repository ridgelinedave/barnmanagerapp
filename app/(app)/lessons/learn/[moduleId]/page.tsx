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
 * THE ADMIN gets an AUTHORING page (David's UI pass, 2026-11-11): a hero row
 * (CourseHero — the cover uncropped, beside the title, a Draft / Published
 * pill, description, one totals line, and Preview as member (text), Edit
 * details (secondary), Publish (the one primary)). Below it a narrow left rail
 * has the categories and Who is watching; the wide right column is the
 * curriculum (CourseEditor). Start and Enroll are not here — they belong to
 * the member view, which Preview shows. On a phone the title is in the
 * oxblood bar, the pill and actions follow the cover, and Who is watching
 * follows the curriculum.
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
          <CourseHero src={course.coverSrc} title={course.title}>
            <div className="flex min-w-0 items-center justify-between gap-3 lg:justify-start">
              <HeroTitle title={course.title} />
              {statusPill}
              {/* Phone: Preview shares the status row. */}
              <span className="lg:hidden">{preview}</span>
            </div>
            {/* Phone: the actions come straight after the tag; description and totals follow. */}
            {course.description && <p className={`${PHONE_LATER} whitespace-pre-line text-body leading-relaxed text-ink`}>{course.description}</p>}
            <p className={`${PHONE_LATER} font-condensed text-label tabular-nums text-muted`}>{totals}</p>
            <div className="order-2 flex flex-wrap items-center gap-2 lg:order-none">
              <span className="hidden lg:inline-flex">{preview}</span>
              {/* One primary: Publish. On a phone it leads the row. */}
              <span className="order-2 lg:order-none">{editDetails}</span>
              <span className="order-1 lg:order-none">{publish}</span>
            </div>
          </CourseHero>
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
        {categoryNames.length > 0 && (
          <ul aria-label="Categories" className="flex flex-wrap gap-1.5">
            {categoryNames.map((name) => (
              <li key={name} className="rounded-chip bg-accent-tint px-2 py-0.5 text-label text-accent-text">
                {name}
              </li>
            ))}
          </ul>
        )}
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
  const visible = outline.filter((s) => s.lessons.length > 0);
  const visibleLessons = visible.flatMap((s) => s.lessons);
  const totals = outlineSummary(visible.length, visibleLessons.length, totalSeconds(visibleLessons));

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
          <CourseHero src={course.coverSrc} title={course.title}>
            <HeroTitle title={course.title} />
            {course.description && <p className={`${PHONE_LATER} whitespace-pre-line text-body leading-relaxed text-ink`}>{course.description}</p>}
            {visibleLessons.length > 0 && <p className={`${PHONE_LATER} font-condensed text-label tabular-nums text-muted`}>{totals}</p>}
            {course.lessonCount > 0 && (
              // ONE primary: Start / Continue / Watch again. Enroll is a text button.
              <div className="order-2 flex flex-wrap items-center gap-2 lg:order-none">
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
            {course.enrolled && course.lessonCount > 0 && (
              <div className="order-2 lg:order-none">
                <ProgressBar percent={course.percent} label={`${course.title} progress`} />
              </div>
            )}
          </CourseHero>
        </>
      }
    >
      <CourseOutline sections={visible} />
    </TabPage>
  );
}

/** On a phone, after the actions (flex order); on the desk, in source order. */
const PHONE_LATER = "order-3 lg:order-none";

/**
 * The course page's hero row (David, 2026-11-11). Belle's cover is NEVER
 * cropped: it renders at its own aspect ratio. On the desk the cover takes
 * ~45% of the content width with the title, tag, description, totals and
 * actions to its right; on a phone it is full width, and the tag and actions
 * follow it (the children's `order` classes put description and totals after).
 */
function CourseHero({ src, title, children }: { src: string | null; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)] lg:items-start lg:gap-8">
      <CourseCover src={src} title={title} natural />
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  );
}

/**
 * The title beside the cover, on the desk. The page's h1 is in the header —
 * screen-reader-only there on the desk (TabPage `lead`), and the visible
 * title on a phone, where the oxblood bar shows it — so this one is
 * presentation only, never a second heading.
 */
function HeroTitle({ title }: { title: string }) {
  return (
    <p aria-hidden="true" className="hidden min-w-0 font-display text-[1.75rem] leading-tight text-ink lg:block">
      {title}
    </p>
  );
}
