import { TabPage } from "@/components/TabPage";
import { BarnGroup } from "@/components/BarnGroup";
import { ListRow, RowList } from "@/components/ui/ListRow";
import { EmptyState } from "@/components/ui/primitives";
import { currentRole } from "@/lib/guard";
import { featureEnabled } from "@/config/barn";
import { BARN_GROUPS, roleCanAccess, visibleEntries, type DestinationGroup } from "@/lib/nav";
import { DueSoon, FeedNow, OpenMaintenance, YourSupplies } from "@/components/barn/DaySummary";
import type { Role } from "@/lib/types";

export const metadata = { title: "Barn" };

/**
 * The barn — the DAY, not a menu (standing rule: a landing page whose only
 * content is links is a wasted screen; 2026-10-20).
 *
 * Barn has more than three destinations, so a segmented control is wrong.
 * Instead the landing page carries what someone opening it in the aisle came
 * for — the feed board right now, what is due, what is broken — and every
 * other screen is reachable from the groups beneath, collapsible on a phone.
 *
 * Every read here is an existing one on the viewer's own session (RLS), and a
 * section only renders for a role whose gate admits the screen it summarises.
 * The destination rows still come from lib/nav.ts (BARN_GROUPS), because the
 * desktop sidebar is derived from the same list.
 */

function Group({ group, role }: { group: DestinationGroup; role: Role }) {
  const live = visibleEntries(group, role, featureEnabled);
  if (live.length === 0) return null;
  return (
    <BarnGroup title={group.title} storageKey={`barn-group:${role}:${group.title}`}>
      <RowList>
        {live.map((entry) => (
          <ListRow key={entry.href} href={entry.href} title={entry.title} />
        ))}
      </RowList>
    </BarnGroup>
  );
}

export default async function BarnPage() {
  // No requireTab: Barn is a tab for every role. Each section below checks
  // the gate for the screen it summarises, and each screen guards itself.
  const role = await currentRole();
  const barnSide = role === "admin" || role === "staff";

  const showFeed = barnSide && featureEnabled("tasks") && featureEnabled("horses") && roleCanAccess(role, "/tasks/feed");
  const showCare = barnSide && featureEnabled("care");
  const showMaintenance = barnSide && roleCanAccess(role, "/barn/maintenance");

  const anything = BARN_GROUPS.some((group) => visibleEntries(group, role, featureEnabled).length > 0);

  return (
    <TabPage density="normal" title="Barn" layout="wide">
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:items-start lg:gap-8">
        {showFeed && <FeedNow />}
        {showCare && <DueSoon role={role} />}
        {showMaintenance && <OpenMaintenance />}
        {role === "parent" && <YourSupplies />}
      </div>

      {/* On the desk the sidebar already lists every one of these screens, so
          the groups are the phone's way in only. */}
      {anything ? (
        <div className="flex flex-col gap-4 lg:hidden">
          {BARN_GROUPS.map((group) => (
            <Group key={group.title} group={group} role={role} />
          ))}
        </div>
      ) : (
        <EmptyState title="Nothing here yet" />
      )}
    </TabPage>
  );
}
