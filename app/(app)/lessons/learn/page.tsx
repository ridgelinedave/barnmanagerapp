import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { ListRow } from "@/components/ui/ListRow";
import { Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { requireTab } from "@/lib/guard";
import { listModules } from "@/lib/learning";
import { barn, featureEnabled } from "@/config/barn";

/**
 * Learning modules — a Monarch capability, named per barn (DESIGN-MASTER §8).
 * The title is `barn.learning.label` ("CE Academy" for Crouse); the route is
 * /lessons/learn on every barn, so no barn's name is ever in a URL.
 *
 * Under the Lessons tab, where the barn owner asked for it.
 *
 * What a viewer sees is decided by RLS alone: admin every module (drafts
 * marked), staff every published one, a family the published ones in their
 * audience. A family who can see none gets the empty line, not an error.
 */
export const metadata = { title: barn.learning.label };

export default async function LearningPage() {
  const role = await requireTab("/lessons");

  if (!featureEnabled("learning")) {
    return (
      <TabPage title={barn.learning.label} back="/lessons">
        <StubScreen heading={barn.learning.label} phase="Phase 2" detail="Video lessons, grouped into modules." />
      </TabPage>
    );
  }

  const modules = await listModules();

  return (
    <TabPage title={barn.learning.label} back="/lessons" density="tight">
      <section className="flex flex-col gap-3">
        <SectionHeader title="Modules" count={modules.length ? `${modules.length}` : undefined} />
        {modules.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            body={
              role === "admin"
                ? "Modules appear here as videos are added."
                : "When the barn shares a module with you, it appears here."
            }
          />
        ) : (
          <div className="flex flex-col gap-3 lg:gap-0">
            {modules.map((module) => (
              <ListRow
                key={module.id}
                href={`/lessons/learn/${module.id}`}
                title={module.title}
                meta={`${module.lessonCount} ${module.lessonCount === 1 ? "lesson" : "lessons"}`}
                leading={
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-sunk text-muted lg:size-7 lg:bg-transparent">
                    <Icon name="play" className="size-5 lg:size-4" />
                  </span>
                }
                chips={
                  !module.published || module.audience === "level" ? (
                    <ChipRow>
                      {!module.published && <Chip value="Draft — only you can see it" icon="eyeOff" tone="gold" />}
                      {module.audience === "level" && <Chip value="One level only" />}
                    </ChipRow>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </section>
    </TabPage>
  );
}
