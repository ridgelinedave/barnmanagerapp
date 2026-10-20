import { TabPage } from "@/components/TabPage";
import { SectionHeader } from "@/components/ui/primitives";
import { ListRow, RowList } from "@/components/ui/ListRow";
import { EmptyState } from "@/components/ui/primitives";
import { currentRole } from "@/lib/guard";
import { featureEnabled } from "@/config/barn";
import { BARN_GROUPS, visibleEntries, type DestinationGroup } from "@/lib/nav";
import type { Role } from "@/lib/types";

export const metadata = { title: "Barn" };

/**
 * The barn: everything to do with the horses and the running of the day.
 *
 * This is the old Manage index re-cut. Manage was an admin-only tab holding a
 * mix of barn operations, family paperwork and access control, which meant the
 * word "Manage" told you who you were rather than what you would find. The
 * split is by SUBJECT now — the barn here, teaching under Lessons, access
 * under More — and the tab is the same for everyone, with the rows filtered by
 * role.
 *
 * Rows, not cards: a table of contents of eight cards with a heading and a
 * line of text each is the identical-card-grid the design system exists to
 * avoid, and rows scan faster with a thumb.
 *
 * Supply list, water troughs, blanketing and turnout landed with migration
 * 0022 and are listed below. TEAM CHAT is still deliberately absent: it has no
 * tables and no screen, and a row that opens a stub is worse than no row —
 * this index is built on the promise that what is listed is what works.
 *
 * The rows themselves live in lib/nav.ts (BARN_GROUPS), because the desktop
 * sidebar is derived from the same list. Edit them there.
 */
function Group({ group, role }: { group: DestinationGroup; role: Role }) {
  const live = visibleEntries(group, role, featureEnabled);
  // A group whose whole contents are switched off, or belong to another role,
  // does not render at all — no empty heading.
  if (live.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={group.title} />
      <RowList>
        {live.map((entry) => (
          <ListRow key={entry.href} href={entry.href} title={entry.title} />
        ))}
      </RowList>
    </section>
  );
}

export default async function BarnPage() {
  // No requireTab: Barn is a tab for every role. What differs is the rows,
  // and every screen a row points at guards itself.
  const role = await currentRole();

  const anything = BARN_GROUPS.some(
    (group) => visibleEntries(group, role, featureEnabled).length > 0,
  );

  return (
    <TabPage density="tight" title="Barn">
      {anything ? (
        BARN_GROUPS.map((group) => <Group key={group.title} group={group} role={role} />)
      ) : (
        <EmptyState title="Nothing here yet" />
      )}
    </TabPage>
  );
}
