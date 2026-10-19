import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { LessonsSegments } from "@/components/LessonsSegments";
import { LessonRow } from "@/components/LessonRow";
import { Button } from "@/components/ui/Button";
import { Chip, ChipRow, EmptyState } from "@/components/ui/primitives";
import { requireTab } from "@/lib/guard";
import { formatDuration, listModulesWithLessons } from "@/lib/learning";
import { barn, featureEnabled } from "@/config/barn";
import { setModulePublished } from "./actions";

/**
 * The Academy — a Monarch capability, named per barn (DESIGN-MASTER §8). The
 * name is `barn.learning.label` ("CE Academy" for Crouse); the route is
 * /lessons/learn on every barn, so no barn's name is ever in a URL.
 *
 * A Lessons segment, and FLAT: every module is a heading with its lessons
 * already listed under it, so a lesson is one tap from here and two from the
 * Lessons tab. There is no module screen to open — /lessons/learn/<module>
 * redirects back to that module's heading here. Draft state and Publish sit on
 * the heading.
 *
 * What a viewer sees is decided by RLS alone: admin every module (drafts
 * marked), staff every published one, a family the published ones in their
 * audience. A family who can see none gets the empty line, not an error.
 */
export const metadata = { title: barn.learning.label };

export default async function LearningPage() {
  const role = await requireTab("/lessons");
  const tabs = <LessonsSegments role={role} current="/lessons/learn" />;

  if (!featureEnabled("learning")) {
    return (
      <TabPage title="Lessons" tabs={tabs}>
        <StubScreen heading={barn.learning.label} phase="Phase 2" />
      </TabPage>
    );
  }

  const modules = await listModulesWithLessons();
  const isAdmin = role === "admin";

  return (
    <TabPage title="Lessons" tabs={tabs} density="tight">
      {modules.length === 0 ? (
        <EmptyState title="No modules yet" />
      ) : (
        modules.map((module) => (
          <section key={module.id} id={`module-${module.id}`} className="flex scroll-mt-24 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line pb-2">
              <h2 className="min-w-0 flex-1 font-display text-heading text-ink">{module.title}</h2>
              {(!module.published || module.audience === "level") && (
                <ChipRow>
                  {!module.published && <Chip value="Draft" icon="eyeOff" tone="gold" />}
                  {module.audience === "level" && <Chip value="One level only" />}
                </ChipRow>
              )}
              {isAdmin && (
                <form action={setModulePublished}>
                  <input type="hidden" name="id" value={module.id} />
                  <input type="hidden" name="published" value={module.published ? "false" : "true"} />
                  <Button
                    type="submit"
                    variant={module.published ? "secondary" : "primary"}
                    arrow={false}
                    className="min-h-11 px-3 lg:min-h-9"
                  >
                    {module.published ? "Unpublish" : "Publish"}
                  </Button>
                </form>
              )}
            </div>

            {module.description && <p className="text-body text-ink">{module.description}</p>}

            {module.lessons.length === 0 ? (
              <EmptyState title="No lessons yet" />
            ) : (
              <ol className="flex flex-col gap-2 lg:gap-0">
                {module.lessons.map((lesson, index) => (
                  <LessonRow
                    key={lesson.id}
                    moduleId={module.id}
                    lesson={lesson}
                    index={index}
                    count={module.lessons.length}
                    duration={formatDuration(lesson.duration_seconds)}
                    reorder={isAdmin && module.lessons.length > 1}
                  />
                ))}
              </ol>
            )}
          </section>
        ))
      )}
    </TabPage>
  );
}
