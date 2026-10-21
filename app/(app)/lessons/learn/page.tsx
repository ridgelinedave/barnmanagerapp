import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { LessonsSegments } from "@/components/LessonsSegments";
import { CourseCard, CourseGrid } from "@/components/academy/CourseCard";
import { CategoryChips, CourseScopeToggle } from "@/components/academy/CategoryChips";
import { CourseForm } from "@/components/academy/CourseForm";
import { SheetTrigger } from "@/components/ui/Sheet";
import { EmptyState } from "@/components/ui/primitives";
import { requireTab } from "@/lib/guard";
import { listCategories, listCourses } from "@/lib/academy";
import { listLevels } from "@/lib/lessons";
import { barn, featureEnabled } from "@/config/barn";
import { enrolInCourse } from "./course-actions";

export const metadata = { title: barn.learning.label };

/**
 * The Academy — a Monarch capability, named per barn (DESIGN-MASTER §8):
 * `barn.learning.label` ("CE Academy" at Crouse) on screen, /lessons/learn as
 * the route on every barn.
 *
 * Circle's STRUCTURE in the Monarch look: All courses / My courses, the
 * barn's category chips, and a grid of courses (1 column on a phone, 2 on a
 * tablet, 3 on the desk). Each card is Enroll, or a progress bar with
 * "N% complete" and Continue — which opens the NEXT INCOMPLETE LESSON, so
 * resuming is two taps from the Lessons tab: this segment, then Continue.
 *
 * Who sees which course is RLS alone (0023's audience rule): admin every
 * course, drafts marked; staff every published one; a client the published
 * ones in their audience.
 */
export default async function AcademyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const role = await requireTab("/lessons");
  const tabs = <LessonsSegments role={role} current="/lessons/learn" />;

  if (!featureEnabled("learning")) {
    return (
      <TabPage title="Lessons" tabs={tabs}>
        <StubScreen heading={barn.learning.label} phase="Phase 2" />
      </TabPage>
    );
  }

  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const scope = one(params.scope) === "mine" ? "mine" : "all";
  const categoryParam = one(params.category) ?? null;
  const isAdmin = role === "admin";

  const [courses, categories, levels] = await Promise.all([
    listCourses(),
    listCategories(),
    isAdmin ? listLevels() : Promise.resolve([]),
  ]);
  const activeCategory = categories.some((c) => c.id === categoryParam) ? categoryParam : null;

  const shown = courses
    .filter((c) => (scope === "mine" ? c.enrolled : true))
    .filter((c) => (activeCategory ? c.categoryIds.includes(activeCategory) : true));
  // Only chips that would show something; an empty category is noise.
  const usedCategories = categories.filter((cat) => courses.some((c) => c.categoryIds.includes(cat.id)));

  const href = (next: { scope?: "all" | "mine"; category?: string | null }) => {
    const q = new URLSearchParams();
    const s = next.scope ?? scope;
    const c = next.category === undefined ? activeCategory : next.category;
    if (s === "mine") q.set("scope", "mine");
    if (c) q.set("category", c);
    const qs = q.toString();
    return `/lessons/learn${qs ? `?${qs}` : ""}`;
  };

  return (
    <TabPage
      title="Lessons"
      tabs={tabs}
      layout="wide"
      density="normal"
      action={
        isAdmin ? (
          <SheetTrigger label="New course" title="New course" variant="primary">
            <CourseForm categories={categories} levels={levels.map((l) => ({ id: l.id, name: l.name }))} />
          </SheetTrigger>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="lg:w-80">
          <CourseScopeToggle scope={scope} hrefFor={(s) => href({ scope: s })} />
        </div>
        {usedCategories.length > 0 && (
          <CategoryChips categories={usedCategories} activeId={activeCategory} hrefFor={(id) => href({ category: id })} />
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={
            scope === "mine" ? "No courses started yet" : activeCategory ? "No courses in this category" : "No courses yet"
          }
        />
      ) : (
        <CourseGrid>
          {shown.map((c) => (
            <CourseCard
              key={c.id}
              id={c.id}
              title={c.title}
              coverSrc={c.coverSrc}
              href={`/lessons/learn/${c.id}`}
              enrolled={c.enrolled}
              percent={c.percent}
              continueHref={c.continueLessonId ? `/lessons/learn/${c.id}/${c.continueLessonId}` : null}
              enrollAction={c.lessonCount > 0 ? enrolInCourse : undefined}
              badge={isAdmin && !c.published ? "Draft" : undefined}
            />
          ))}
        </CourseGrid>
      )}
    </TabPage>
  );
}
