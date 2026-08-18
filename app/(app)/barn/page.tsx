import { TabPage } from "@/components/TabPage";
import { SectionHeader } from "@/components/ui/primitives";
import { ListRow } from "@/components/ui/ListRow";
import { Icon, type IconName } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/primitives";
import { currentRole } from "@/lib/guard";
import { featureEnabled, type BarnFeatureFlag } from "@/config/barn";
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
 * SUPPLY LIST, WATER TROUGHS, BLANKETING and TEAM CHAT are deliberately
 * absent. Migration 0022 is written but unapplied and unaudited, so the tables
 * behind three of them do not exist yet; a row that opens a stub is worse than
 * no row, and this screen has just been rebuilt on the promise that what is
 * listed is what works. The GROUPS below are the shape they will slot into.
 */
type Entry = {
  /** Omitted for screens over always-present tables with no switch. */
  flag?: BarnFeatureFlag;
  href: string;
  title: string;
  meta: string;
  icon: IconName;
  /** Who sees the row. Mirrors the guard on the screen it points at. */
  roles: Role[];
};

const BARN_SIDE: Role[] = ["staff", "admin"];
const ADMIN: Role[] = ["admin"];

/**
 * The day. What someone opens the app standing in the aisle to do.
 */
const TODAY: Entry[] = [
  {
    flag: "tasks",
    href: "/tasks/feed",
    title: "Feed board",
    meta: "Tonight's feed, by horse",
    icon: "horse",
    roles: BARN_SIDE,
  },
  {
    flag: "tasks",
    href: "/tasks",
    title: "Task list",
    meta: "Today's jobs and who is doing them",
    icon: "list",
    roles: ["staff"],
  },
  {
    flag: "tasks",
    href: "/manage/tasks",
    title: "Task list",
    meta: "Templates, today's jobs, and who's doing what",
    icon: "list",
    roles: ADMIN,
  },
  {
    flag: "clockIn",
    href: "/clock",
    title: "Clock in",
    meta: "Start and end your shift",
    icon: "clock",
    roles: ["staff"],
  },
  {
    flag: "clockIn",
    href: "/manage/timesheets",
    title: "Clock-ins & timesheets",
    meta: "Who's on the clock, hours, corrections and export",
    icon: "clock",
    roles: ADMIN,
  },
];

/**
 * The horses. Records rather than jobs.
 *
 * Horses points at two different screens on purpose: the barn's full record,
 * and the family's own horses. Same subject, different scope — and the scope
 * is enforced by RLS on both, not by which row someone tapped.
 */
const HORSES: Entry[] = [
  {
    flag: "horses",
    href: "/manage/horses",
    title: "Horses",
    meta: "Records, who rides what, and feed charts",
    icon: "horse",
    // ADMIN, not BARN_SIDE. The screen lives under /manage, which is
    // admin-gated, so listing it for staff would have shown them a row that
    // redirected to Home when tapped. Staff never had a horses screen; this
    // restructure is not the place to give them one.
    roles: ADMIN,
  },
  {
    flag: "horses",
    href: "/more/horses",
    title: "My horses",
    meta: "Your horse's record, feed chart and care history",
    icon: "horse",
    roles: ["parent"],
  },
  {
    flag: "care",
    href: "/manage/care",
    title: "Care due",
    meta: "Vaccines, Coggins, worming and farrier dates coming up",
    icon: "alert",
    roles: ADMIN,
  },
];

/**
 * Barn-wide records that are neither a job nor a horse.
 *
 * Announcements, events and forms were on the old Manage index and the brief
 * for this restructure did not name a new home for them. They are barn
 * operations, so they are here rather than stranded — flagged for David, and
 * cheap to move if he wants them elsewhere.
 */
const RECORDS: Entry[] = [
  {
    flag: "announcements",
    href: "/manage/announcements",
    title: "Announcements",
    meta: "Post barn news to families and staff",
    icon: "bell",
    roles: ADMIN,
  },
  {
    flag: "events",
    href: "/manage/events",
    title: "Barn events",
    meta: "Clinics, farrier and vet days, closures",
    icon: "pin",
    roles: ADMIN,
  },
  {
    flag: "forms",
    href: "/manage/forms",
    title: "Forms",
    meta: "Who has signed their paperwork, and who hasn't",
    icon: "document",
    roles: ADMIN,
  },
];

function Group({ title, entries, role }: { title: string; entries: Entry[]; role: Role }) {
  const live = entries.filter(
    (entry) => entry.roles.includes(role) && (!entry.flag || featureEnabled(entry.flag)),
  );
  // A group whose whole contents are switched off, or belong to another role,
  // does not render at all — no empty heading.
  if (live.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={title} />
      {live.map((entry) => (
        <ListRow
          key={entry.href}
          href={entry.href}
          title={entry.title}
          meta={entry.meta}
          leading={
            <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-sunk text-accent-text">
              <Icon name={entry.icon} className="size-5" />
            </span>
          }
        />
      ))}
    </section>
  );
}

export default async function BarnPage() {
  // No requireTab: Barn is a tab for every role. What differs is the rows,
  // and every screen a row points at guards itself.
  const role = await currentRole();

  const groups = [
    { title: "Today", entries: TODAY },
    { title: "Horses", entries: HORSES },
    { title: "Records", entries: RECORDS },
  ];

  const anything = groups.some(({ entries }) =>
    entries.some((e) => e.roles.includes(role) && (!e.flag || featureEnabled(e.flag))),
  );

  return (
    <TabPage title="Barn">
      {anything ? (
        groups.map(({ title, entries }) => (
          <Group key={title} title={title} entries={entries} role={role} />
        ))
      ) : (
        <EmptyState
          title="Nothing here yet"
          body="This is where the barn's horses and daily jobs will appear."
        />
      )}
    </TabPage>
  );
}
