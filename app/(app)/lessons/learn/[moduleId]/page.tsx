import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { ListRow } from "@/components/ui/ListRow";
import { Button } from "@/components/ui/Button";
import { Callout, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { requireTab } from "@/lib/guard";
import { formatDuration, loadModule } from "@/lib/learning";
import { barn, featureEnabled } from "@/config/barn";
import { moveLesson, setModulePublished } from "../actions";

export const metadata = { title: barn.learning.label };

/**
 * One module: its lessons, in order.
 *
 * `loadModule` reads under the viewer's own session, so a module this viewer
 * may not see comes back null and the page is a 404 — the same answer as a
 * module that does not exist, which is the point: the page does not confirm
 * that a hidden module is there.
 */
export default async function LearningModulePage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const role = await requireTab("/lessons");
  if (!featureEnabled("learning")) notFound();

  const { moduleId } = await params;
  const loaded = await loadModule(moduleId);
  if (!loaded) notFound();
  const { module, lessons } = loaded;
  const isAdmin = role === "admin";

  const publishToggle = isAdmin ? (
    <form action={setModulePublished}>
      <input type="hidden" name="id" value={module.id} />
      <input type="hidden" name="published" value={module.published ? "false" : "true"} />
      {/* In the phone's oxblood header a secondary (ink, transparent) button
          would be ink on oxblood — so it goes white there; ink on desktop. */}
      <Button
        type="submit"
        variant={module.published ? "secondary" : "primary"}
        arrow={false}
        className={`max-lg:min-h-11 max-lg:px-3 max-lg:text-[0.875rem] lg:min-h-9 ${
          module.published ? "max-lg:border-white/40 max-lg:text-white" : ""
        }`}
      >
        {module.published ? "Unpublish" : "Publish"}
      </Button>
    </form>
  ) : undefined;

  return (
    <TabPage title={module.title} back="/lessons/learn" action={publishToggle} density="tight">
      {isAdmin && !module.published && (
        <Callout icon="eyeOff">
          Draft. Only you can see it until you publish.
        </Callout>
      )}

      {module.description && <p className="text-body text-ink">{module.description}</p>}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Lessons" count={lessons.length ? `${lessons.length}` : undefined} />
        {lessons.length === 0 ? (
          <EmptyState title="No lessons yet" />
        ) : (
          <ol className="flex flex-col gap-3 lg:gap-0">
            {lessons.map((lesson, index) => (
              <li key={lesson.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <ListRow
                    href={`/lessons/learn/${module.id}/${lesson.id}`}
                    title={lesson.title}
                    meta={formatDuration(lesson.duration_seconds) ?? undefined}
                    leading={
                      /* The lesson's place in the module, in the condensed
                         face, tabular so 1–9 and 10+ line up. */
                      <span
                        aria-hidden="true"
                        className="flex size-10 shrink-0 items-center justify-center rounded-control bg-sunk font-display text-heading tabular-nums text-ink lg:size-7 lg:bg-transparent lg:text-table"
                      >
                        {index + 1}
                      </span>
                    }
                  />
                </div>
                {isAdmin && lessons.length > 1 && (
                  <div className="flex shrink-0 flex-col gap-1 lg:flex-row">
                    {(["up", "down"] as const).map((direction) => {
                      const disabled = direction === "up" ? index === 0 : index === lessons.length - 1;
                      return (
                        <form key={direction} action={moveLesson}>
                          <input type="hidden" name="module_id" value={module.id} />
                          <input type="hidden" name="lesson_id" value={lesson.id} />
                          <input type="hidden" name="direction" value={direction} />
                          <button
                            type="submit"
                            disabled={disabled}
                            aria-label={`Move “${lesson.title}” ${direction}`}
                            className="flex size-11 items-center justify-center rounded-control border border-line bg-surface text-ink disabled:opacity-40 lg:size-8 lg:hover:bg-sunk"
                          >
                            <Icon
                              name="chevron"
                              className={`size-4 ${direction === "up" ? "-rotate-90" : "rotate-90"}`}
                              strokeWidth={2}
                            />
                          </button>
                        </form>
                      );
                    })}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </TabPage>
  );
}
