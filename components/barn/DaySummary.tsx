import { ListRow, RowList } from "@/components/ui/ListRow";
import { Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { barn } from "@/config/barn";
import { roleCanAccess } from "@/lib/nav";
import { feedBoardByHorse } from "@/lib/horses";
import { careDueBetween, careDueSoon, careRecentByHorse } from "@/lib/care";
import { isRunningLow, listMaintenance, listSupplies } from "@/lib/barn-ops";
import { addBarnDays, barnToday, formatBarnDayLabel } from "@/lib/dates";
import { BOARD_MEAL_LABELS, barnClockHHMM, buildBoard, currentMeal } from "@/lib/feed-board";
import { CARE_TYPE_LABELS, MAINTENANCE_STATUS_LABELS, type CareEvent, type Role } from "@/lib/types";

/**
 * The barn's day, in summary blocks — shared by the Barn landing and the
 * admin/staff Home dashboard, so both always say the same thing. Each is a
 * server component on the viewer's own session (RLS); the caller decides
 * which a role sees (by the gate on the screen each one summarises).
 */
const DUE_DAYS = 7;

/** Feed board now: the current meal, how many horses it feeds, care due today. */
export async function FeedNow() {
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
export async function DueSoon({ role }: { role: Role }) {
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
export async function OpenMaintenance() {
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
export async function YourSupplies() {
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
