import { TabPage } from "@/components/TabPage";
import { EmptyState, SectionHeader } from "@/components/ui/primitives";
import { ListRow } from "@/components/ui/ListRow";
import { Icon } from "@/components/ui/Icon";
import { currentRole } from "@/lib/guard";
import { barn, featureEnabled } from "@/config/barn";
import { LESSONS_GROUP, labelFor, visibleEntries } from "@/lib/nav";

export const metadata = { title: "Lessons" };

/**
 * Lessons — everything to do with teaching and competing.
 *
 * This tab used to BE the family's lesson list. Making it a section costs a
 * family one tap to reach their own lessons, which is a real cost and worth
 * naming: it buys one bar for every role, and it gives shows and makeups a
 * home that is not a fourth tab. The lessons themselves are the first row, and
 * the time-sensitive thing — an open makeup offer — is still pushed to Home,
 * so nothing important now depends on someone navigating here.
 *
 * Learning modules (DESIGN-MASTER §8) come later and will slot in as a row.
 *
 * The rows live in lib/nav.ts (LESSONS_GROUP), because the desktop sidebar is
 * derived from the same list. Edit them there.
 */
export default async function LessonsPage() {
  // No requireTab: Lessons is a tab for every role. The rows are filtered
  // below, and every screen they point at guards itself.
  const role = await currentRole();

  const live = visibleEntries(LESSONS_GROUP, role, featureEnabled);

  return (
    <TabPage title="Lessons">
      {live.length === 0 ? (
        <EmptyState title="Nothing here yet" />
      ) : (
        <section className="flex flex-col gap-3">
          <SectionHeader title={LESSONS_GROUP.title} />
          {live.map((entry) => (
            <ListRow
              key={entry.href}
              href={entry.href}
              title={labelFor(entry, { learning: barn.learning.label })}
              leading={
                <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-sunk text-muted lg:size-7 lg:bg-transparent">
                  <Icon name={entry.icon} className="size-5 lg:size-4" />
                </span>
              }
            />
          ))}
        </section>
      )}
    </TabPage>
  );
}
