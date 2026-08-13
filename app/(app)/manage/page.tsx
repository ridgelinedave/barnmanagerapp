import { TabPage } from "@/components/TabPage";
import { SectionHeader } from "@/components/ui/primitives";
import { ListRow } from "@/components/ui/ListRow";
import { Icon, type IconName } from "@/components/ui/Icon";
import { requireTab } from "@/lib/guard";
import { featureEnabled, type BarnFeatureFlag } from "@/config/barn";

export const metadata = { title: "Manage" };

/**
 * Belle's index.
 *
 * A table of contents, so it is rows rather than cards — eight cards with a
 * heading and a line of text each is the identical-card-grid the design system
 * exists to avoid, and rows scan faster with a thumb anyway.
 *
 * Grouped by what she is actually doing: running today, keeping records, and
 * talking to families. A flat list of eight is a list you read every time; a
 * grouped list is one you learn.
 */
type Entry = {
  /** Omitted for screens that manage always-present tables and have no switch. */
  flag?: BarnFeatureFlag;
  href: string;
  title: string;
  meta: string;
  icon: IconName;
};

/*
 * No Calendar row any more. It pointed at a second screen showing the same
 * hours as the Schedule tab, one tap away in the bottom nav; the month and
 * agenda views live on Schedule now, so a row here would be an index entry for
 * a tab.
 */
const TODAY: Entry[] = [
  {
    flag: "clockIn",
    href: "/manage/timesheets",
    title: "Clock-ins & timesheets",
    meta: "Who's on the clock right now, hours, corrections and export",
    icon: "clock",
  },
  {
    flag: "tasks",
    href: "/manage/tasks",
    title: "Tasks",
    meta: "Templates, today's jobs, and who's doing what",
    icon: "list",
  },
  {
    flag: "lessons",
    href: "/manage/lesson-templates",
    title: "Weekly schedule",
    meta: "The repeating lesson pattern",
    icon: "calendar",
  },
  {
    flag: "events",
    href: "/manage/events",
    title: "Barn events",
    meta: "Add shows, clinics, farrier and vet days, closures",
    icon: "pin",
  },
];

const RECORDS: Entry[] = [
  {
    flag: "horses",
    href: "/manage/horses",
    title: "Horses",
    meta: "Records, who rides what, and feed charts",
    icon: "horse",
  },
  {
    flag: "care",
    href: "/manage/care",
    title: "Care due",
    meta: "Vaccines, Coggins, worming and farrier dates coming up",
    icon: "alert",
  },
];

const FAMILIES: Entry[] = [
  {
    flag: "announcements",
    href: "/manage/announcements",
    title: "Announcements",
    meta: "Post barn news to families and staff",
    icon: "bell",
  },
  {
    flag: "forms",
    href: "/manage/forms",
    title: "Forms",
    meta: "Who has signed their paperwork, and who hasn't",
    icon: "document",
  },
];

/**
 * Team & access leads the index.
 *
 * It was last, below the flagged groups. Wrong order: who can get in and what
 * they can do is the thing Belle reaches for when someone joins, someone
 * leaves, or someone cannot see what they should — and all three are urgent in
 * a way that "the repeating lesson pattern" is not.
 *
 * It has no feature flag because it manages the Phase 0 identity tables, which
 * have been live since the first migration — there is no switch to be off. It
 * is also the one screen here that is admin-only rather than
 * permission-flagged: deciding who has permissions is not itself a grantable
 * permission.
 */
const TEAM: Entry[] = [
  {
    href: "/manage/team",
    title: "Team & access",
    meta: "Invite someone, set roles and permissions, families and riders",
    icon: "people",
  },
];

function Group({ title, entries }: { title: string; entries: Entry[] }) {
  const live = entries.filter((entry) => !entry.flag || featureEnabled(entry.flag));
  // A group whose whole contents are switched off does not render at all.
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

export default async function ManagePage() {
  await requireTab("/manage");

  // No "still to come" stub here any more. It claimed invites were unbuilt
  // months after they shipped — a screen that lies about the product is worse
  // than one that says nothing, and Belle has no use for a roadmap on her index.
  return (
    <TabPage title="Manage">
      <Group title="Team & access" entries={TEAM} />
      <Group title="Running the day" entries={TODAY} />
      <Group title="Records" entries={RECORDS} />
      <Group title="Families" entries={FAMILIES} />
    </TabPage>
  );
}
