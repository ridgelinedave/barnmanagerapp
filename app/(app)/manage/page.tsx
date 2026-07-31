import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
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
type Entry = { flag: BarnFeatureFlag; href: string; title: string; meta: string; icon: IconName };

const TODAY: Entry[] = [
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
    title: "Calendar",
    meta: "Shows, clinics, farrier and vet days, closures",
    icon: "calendar",
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
  {
    flag: "clockIn",
    href: "/manage/timesheets",
    title: "Timesheets",
    meta: "Review hours, add corrections, approve and export",
    icon: "clock",
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

function Group({ title, entries }: { title: string; entries: Entry[] }) {
  const live = entries.filter((entry) => featureEnabled(entry.flag));
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
            <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-sunk text-gold-deep">
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

  return (
    <TabPage title="Manage">
      <Group title="Running the day" entries={TODAY} />
      <Group title="Records" entries={RECORDS} />
      <Group title="Families" entries={FAMILIES} />

      <StubScreen
        heading="More management tools"
        phase="Phases 2–3"
        detail="Families and riders, QuickBooks sync and the show tools are still to come."
      />
    </TabPage>
  );
}
