import { TabPage } from "@/components/TabPage";
import { EmptyState, SectionHeader } from "@/components/ui/primitives";
import { ListRow } from "@/components/ui/ListRow";
import { Icon, type IconName } from "@/components/ui/Icon";
import { currentRole } from "@/lib/guard";
import { featureEnabled, type BarnFeatureFlag } from "@/config/barn";
import type { Role } from "@/lib/types";

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
 * ACADEMY comes later and will slot in as a fourth row.
 */
type Entry = {
  flag?: BarnFeatureFlag;
  href: string;
  title: string;
  meta: string;
  icon: IconName;
  /** Who sees the row. Mirrors the guard on the screen it points at. */
  roles: Role[];
};

const ALL: Role[] = ["parent", "staff", "admin"];

const ENTRIES: Entry[] = [
  // The family's own lessons. First, because for a parent this tab is still
  // mostly "when does my kid ride".
  {
    flag: "lessons",
    href: "/lessons/mine",
    title: "My lessons",
    meta: "Your riders' next four weeks, and cancelling a spot",
    icon: "calendar",
    roles: ["parent"],
  },
  // The barn's side of the same subject: who rides when, and the repeating
  // pattern the schedule is generated from.
  {
    flag: "lessons",
    href: "/manage/lesson-templates",
    title: "Students",
    meta: "The weekly lesson pattern and who rides in it",
    icon: "people",
    roles: ["admin"],
  },
  {
    flag: "shows",
    href: "/lessons/shows",
    title: "Show information",
    meta: "Where the barn is competing, entries, ride times and results",
    icon: "ribbon",
    roles: ALL,
  },
  {
    flag: "lessons",
    href: "/lessons/makeups",
    title: "Makeups",
    meta: "Open spots when someone cancels",
    icon: "clock",
    roles: ["parent"],
  },
];

export default async function LessonsPage() {
  // No requireTab: Lessons is a tab for every role. The rows are filtered
  // below, and every screen they point at guards itself.
  const role = await currentRole();

  const live = ENTRIES.filter(
    (entry) => entry.roles.includes(role) && (!entry.flag || featureEnabled(entry.flag)),
  );

  return (
    <TabPage title="Lessons">
      {live.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Lessons, shows and makeups will appear here."
        />
      ) : (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Lessons & shows" />
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
      )}
    </TabPage>
  );
}
