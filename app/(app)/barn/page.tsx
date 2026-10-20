import { TabPage } from "@/components/TabPage";
import { BarnGroup } from "@/components/BarnGroup";
import { ListRow, RowList } from "@/components/ui/ListRow";
import { Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { currentRole } from "@/lib/guard";
import { barn, featureEnabled } from "@/config/barn";
import { BARN_GROUPS, roleCanAccess, visibleEntries, type DestinationGroup } from "@/lib/nav";
import { feedBoardByHorse } from "@/lib/horses";
import { careDueBetween, careDueSoon, careRecentByHorse } from "@/lib/care";
import { isRunningLow, listMaintenance, listSupplies } from "@/lib/barn-ops";
import { addBarnDays, barnToday, formatBarnDayLabel } from "@/lib/dates";
import { BOARD_MEAL_LABELS, barnClockHHMM, buildBoard, currentMeal } from "@/lib/feed-board";
import { CARE_TYPE_LABELS, MAINTENANCE_STATUS_LABELS, type CareEvent, type Role } from "@/lib/types";

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
const DUE_DAYS = 7;


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

/** Feed board now: the current meal, how many horses it feeds, care due today. */
async function FeedNow() {
  const today = barnToday();
  const [board, recent, due] = await Promise.all([
    feedBoardByHorse(),
    careRecentByHorse(),
    careDueBetween(today, today),
  ]);
  const dueToday = new Map<string, CareEvent[]>();
  for (const { event } of due) dueToday.set(event.horse_id, [...(dueToday.get(event.horse_id) ?? []), event]);
  const rows = buildBoard({ board, recent, dueToday, today, timezone: barn.timezone });
  const meal = currentMeal(barnClockHHMM(new Date(), barn.timezone), barn.feedMealCutoffs);
  const fed = rows.filter((r) => r.meals[meal].length > 0).length;
  const flagged = rows.flatMap((r) => r.notes.filter((n) => n.dueToday).map((n) => ({ horse: r.name, note: n })));

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Feed board" action={{ href: "/tasks/feed", label: "Open" }} />
      <RowList>
        <ListRow
          href="/tasks/feed"
          title={`${BOARD_MEAL_LABELS[meal]} · now`}
          meta={`${fed} ${fed === 1 ? "horse" : "horses"} to feed`}
        />
      </RowList>
      {flagged.map(({ horse, note }, i) => (
        <p key={i} className="flex flex-wrap items-baseline gap-x-3 border-l-[3px] border-gold bg-gold-tint px-3 py-1.5">
          <span className="font-condensed text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-gold-deep">
            Due today
          </span>
          <span className="min-w-0 text-[0.875rem] text-charcoal-text">
            {horse} · {note.detail}
          </span>
        </p>
      ))}
    </section>
  );
}

/** Care due in the next week, overdue first. */
async function DueSoon({ role }: { role: Role }) {
  const today = barnToday();
  const until = addBarnDays(today, DUE_DAYS);
  const items = (await careDueSoon()).filter(({ event }) => event.due_next && event.due_next <= until);
  const allHref = roleCanAccess(role, "/manage/care") ? "/manage/care" : undefined;

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Due this week"
        count={items.length ? `${items.length}` : undefined}
        action={allHref ? { href: allHref, label: "All" } : undefined}
      />
      {items.length === 0 ? (
        <EmptyState title="Nothing due this week" />
      ) : (
        <RowList>
          {items.slice(0, 5).map(({ event, horse }) => {
            const overdue = (event.due_next ?? "") < today;
            return (
              <ListRow
                key={event.id}
                href={role === "admin" ? `/manage/horses/${horse.id}` : `/more/horses/${horse.id}`}
                title={horse.barn_name || horse.name}
                meta={`${CARE_TYPE_LABELS[event.type]} · ${overdue ? "overdue since" : "due"} ${formatBarnDayLabel(event.due_next!)}`}
                chips={overdue ? <ChipRow><Chip value="Overdue" icon="alert" tone="danger" /></ChipRow> : undefined}
              />
            );
          })}
        </RowList>
      )}
    </section>
  );
}

/** What is broken: open and in-progress maintenance. */
async function OpenMaintenance() {
  const open = (await listMaintenance()).filter((r) => r.status !== "done");
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Maintenance"
        count={open.length ? `${open.length} open` : undefined}
        action={{ href: "/barn/maintenance", label: "All" }}
      />
      {open.length === 0 ? (
        <EmptyState title="Nothing open" />
      ) : (
        <RowList>
          {open.slice(0, 5).map((row) => (
            <ListRow
              key={row.id}
              href="/barn/maintenance"
              title={row.title}
              meta={[MAINTENANCE_STATUS_LABELS[row.status], row.assigneeName].filter(Boolean).join(" · ")}
              chips={row.priority === "high" ? <ChipRow><Chip value="Urgent" icon="alert" tone="danger" /></ChipRow> : undefined}
            />
          ))}
        </RowList>
      )}
    </section>
  );
}

/** A client's own: what the barn needs from them. */
async function YourSupplies() {
  const needed = (await listSupplies()).filter((i) => i.scope === "boarder" && i.status !== "received");
  if (needed.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Supplies needed" action={{ href: "/barn/supplies", label: "All" }} />
      <RowList>
        {needed.slice(0, 5).map((item) => (
          <ListRow
            key={item.id}
            href="/barn/supplies"
            title={item.name}
            meta={item.horseName ?? undefined}
            chips={isRunningLow(item) ? <ChipRow><Chip value="Running low" icon="alert" tone="gold" /></ChipRow> : undefined}
          />
        ))}
      </RowList>
    </section>
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

      {anything ? (
        <div className="flex flex-col gap-4">
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
