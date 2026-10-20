import type { Role } from "@/lib/types";
import type { IconName } from "@/components/ui/Icon";
import type { BarnFeatureFlag } from "@/config/barn";

/**
 * Role-driven navigation: the bottom tab bar, the landing-page rows, the
 * desktop sidebar, and the gate they all answer to.
 *
 * The same `role` value that renders these tabs is what the RLS policies check,
 * so UI and security cannot disagree (SPEC §3.2). Max 5 tabs per role (SPEC §7).
 *
 * TYPE-ONLY IMPORTS, ON PURPOSE. tests/nav.test.mjs loads this file straight
 * into Node, the same way the age and month tests load theirs, so it can prove
 * the sidebar and the gate agree. A value import from `@/` would not resolve
 * outside the bundler and the test could not run.
 */
export type Tab = {
  href: string;
  label: string;
  /** Inline SVG path data, 24x24 viewBox, stroke-based. */
  icon: string;
};

const ICONS = {
  home: "M3 10.5 12 3l9 7.5M5.25 9.75V20a1 1 0 0 0 1 1h3.5v-5.5h4.5V21h3.5a1 1 0 0 0 1-1V9.75",
  calendar:
    "M7 3v3m10-3v3M3.5 9.5h17M5 6h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 21H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 6Z",
  /** The barn: a gable over a door. Not a horse — the tab is the place. */
  barn: "M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-9.5Zm6 10.5v-6h5v6",
  ribbon:
    "M12 3a5.25 5.25 0 1 0 0 10.5A5.25 5.25 0 0 0 12 3Zm-3.2 9.6L6.5 21l5.5-2.75L17.5 21l-2.3-8.4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
} as const;

/**
 * ONE BAR, FIVE TABS, EVERY ROLE.
 *
 * It used to be three different bars — parent got Lessons/Shows, staff got
 * Clock/Tasks, admin got Manage/Shows — which meant the app someone described
 * to a colleague was not the app the colleague opened. The five below are the
 * same for everyone; what differs is what each landing page LISTS, which is
 * filtered by role on the page itself.
 *
 * That split matters: a tab is navigation, not a permission. Every screen
 * behind these tabs still guards itself (see ROLE_PATHS and requireTab), and
 * the data behind them is scoped by RLS regardless of what the nav shows.
 */
const TABS: Tab[] = [
  { href: "/home", label: "Home", icon: ICONS.home },
  { href: "/schedule", label: "Schedule", icon: ICONS.calendar },
  { href: "/barn", label: "Barn", icon: ICONS.barn },
  { href: "/lessons", label: "Lessons", icon: ICONS.ribbon },
  { href: "/more", label: "More", icon: ICONS.more },
];

export const TABS_BY_ROLE: Record<Role, Tab[]> = {
  parent: TABS,
  staff: TABS,
  admin: TABS,
};

/**
 * Non-tab routes, and who may reach them.
 *
 * THIS IS WHY REMOVING THE MANAGE TAB DID NOT LOCK BELLE OUT. Every screen
 * under /manage guards with `requireTab("/manage")`, which asked "does this
 * role have a /manage tab?". Delete the tab and that question answers "no" for
 * everyone, including the admin the screens belong to — the whole management
 * side would have redirected to /home.
 *
 * So the gate is now stated directly rather than inferred from the tab list.
 * The roles below are EXACTLY the roles that could reach each path before this
 * restructure; nothing gained access, nothing lost it.
 *
 * This is navigation hygiene, not the security boundary — RLS is. A path here
 * must still be a screen whose policies scope its own content.
 */
const ROLE_PATHS: { prefix: string; roles: Role[] }[] = [
  // The calendar. A tab for staff and admin before, and genuinely for everyone:
  // what a parent sees on it is decided by RLS, not by the nav.
  { prefix: "/schedule", roles: ["parent", "staff", "admin"] },
  // Management screens. Admin-only before, admin-only now.
  { prefix: "/manage", roles: ["admin"] },
  // The time clock. Staff punch in; admin reviews on /manage/timesheets.
  { prefix: "/clock", roles: ["staff"] },
  // ORDER MATTERS HERE — first match wins, so the more specific prefix is
  // listed first. The feed board is the one thing on the old staff-only /tasks
  // branch that Belle needs too: it is the barn's feed chart, and the Barn tab
  // surfaces it for both. The day's job LIST stays staff-only, because admin
  // has its own at /manage/tasks and two task screens for one person is how
  // you end up ticking a job off the wrong one.
  { prefix: "/tasks/feed", roles: ["staff", "admin"] },
  { prefix: "/tasks", roles: ["staff"] },
  // Old homes, kept resolving. See app/(app)/shows and app/(app)/manage.
  { prefix: "/shows", roles: ["parent", "staff", "admin"] },
  { prefix: "/notifications", roles: ["parent", "staff", "admin"] },
];

/** True when `role` is allowed to see `pathname`. Keeps stub routes role-scoped. */
export function roleCanAccess(role: Role, pathname: string): boolean {
  const matched = ROLE_PATHS.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  );
  if (matched) return matched.roles.includes(role);

  return TABS_BY_ROLE[role].some(
    (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`),
  );
}

// ---------------------------------------------------------------------------
// Destinations — every screen a landing page or the sidebar links to.
// ---------------------------------------------------------------------------

/**
 * One row on a landing page, and one link in the desktop sidebar.
 *
 * These lists used to live inside app/(app)/barn, lessons and more, one per
 * page. They moved here so the desktop sidebar could be DERIVED from them
 * instead of written out a second time: a sidebar list kept by hand is how a
 * role ends up shown a link the gate refuses (a dead row) or a screen nobody
 * links to (an unreachable one).
 *
 * `roles` says who is SHOWN the row. It is navigation, not permission — the
 * screen still guards itself, and `sidebarFor` still asks `roleCanAccess`
 * before rendering anything. tests/nav.test.mjs proves no entry lists a role
 * the gate would refuse.
 */
export type Destination = {
  href: string;
  title: string;
  icon: IconName;
  roles: Role[];
  /** Omitted for screens over always-present tables with no switch. */
  flag?: BarnFeatureFlag;
  /**
   * The title is the BARN's name for this capability, not `title` — e.g.
   * learning modules are "CE Academy" at Crouse. `title` is the generic
   * product word used when no label is supplied. Resolved by `labelFor`.
   */
  barnLabel?: keyof BarnLabels;
};

/** Barn-configured names for product capabilities (config/barn.ts). */
export type BarnLabels = { learning: string };

/** The title a role sees for a destination, with the barn's own names applied. */
export function labelFor(entry: Destination, labels?: Partial<BarnLabels>): string {
  return (entry.barnLabel && labels?.[entry.barnLabel]) || entry.title;
}

export type DestinationGroup = { title: string; entries: Destination[] };

const ALL: Role[] = ["parent", "staff", "admin"];
const BARN_SIDE: Role[] = ["staff", "admin"];
const ADMIN: Role[] = ["admin"];

/** Barn — the day. What someone opens the app standing in the aisle to do. */
const BARN_TODAY: DestinationGroup = {
  title: "Today",
  entries: [
    {
      flag: "tasks",
      href: "/tasks/feed",
      title: "Feed board",
      icon: "horse",
      roles: BARN_SIDE,
    },
    {
      flag: "tasks",
      href: "/tasks",
      title: "Task list",
      icon: "list",
      roles: ["staff"],
    },
    {
      flag: "tasks",
      href: "/manage/tasks",
      title: "Task list",
      icon: "list",
      roles: ADMIN,
    },
    {
      flag: "clockIn",
      href: "/clock",
      title: "Time clock",
      icon: "clock",
      roles: ["staff"],
    },
    {
      flag: "clockIn",
      href: "/manage/timesheets",
      title: "Clock-ins and timesheets",
      icon: "clock",
      roles: ADMIN,
    },
  ],
};

/**
 * Barn — the horses. Records rather than jobs.
 *
 * Horses points at two different screens on purpose: the barn's full record,
 * and the family's own horses. Same subject, different scope — and the scope
 * is enforced by RLS on both, not by which row someone tapped.
 */
const BARN_HORSES: DestinationGroup = {
  title: "Horses",
  entries: [
    {
      flag: "horses",
      href: "/manage/horses",
      title: "Horses",
      icon: "horse",
      // ADMIN, not BARN_SIDE. The screen lives under /manage, which is
      // admin-gated, so listing it for staff would have shown them a row that
      // redirected to Home when tapped.
      roles: ADMIN,
    },
    {
      flag: "horses",
      href: "/more/horses",
      title: "My horses",
      icon: "horse",
      roles: ["parent"],
    },
    {
      flag: "care",
      href: "/manage/care",
      title: "Care due",
      icon: "alert",
      roles: ADMIN,
    },
  ],
};

/** Barn — the running of the place (migration 0022). */
const BARN_OPERATIONS: DestinationGroup = {
  title: "Operations",
  entries: [
    {
      href: "/barn/supplies",
      title: "Supplies",
      icon: "bucket",
      // The one barn-ops row a family sees: they get their OWN boarder items,
      // never Crouse stock. Enforced by policy, mirrored here.
      roles: ALL,
    },
    {
      href: "/barn/water",
      title: "Water",
      icon: "bucket",
      roles: BARN_SIDE,
    },
    {
      href: "/barn/blanketing",
      title: "Blanketing",
      icon: "horse",
      roles: ALL,
    },
    {
      href: "/barn/turnout",
      title: "Turnout",
      icon: "pin",
      roles: ALL,
    },
    {
      href: "/barn/maintenance",
      title: "Maintenance",
      icon: "alert",
      roles: BARN_SIDE,
    },
  ],
};

/**
 * Barn — records that are neither a job nor a horse. Announcements, events
 * and forms came off the old Manage index; they are barn operations.
 */
const BARN_RECORDS: DestinationGroup = {
  title: "Records",
  entries: [
    {
      flag: "announcements",
      href: "/manage/announcements",
      title: "Announcements",
      icon: "bell",
      roles: ADMIN,
    },
    {
      flag: "events",
      href: "/manage/events",
      title: "Events",
      icon: "pin",
      roles: ADMIN,
    },
    {
      flag: "forms",
      href: "/manage/forms",
      title: "Forms",
      icon: "document",
      roles: ADMIN,
    },
  ],
};

/** The Barn landing page, in the order it renders. */
export const BARN_GROUPS: DestinationGroup[] = [
  BARN_TODAY,
  BARN_HORSES,
  BARN_OPERATIONS,
  BARN_RECORDS,
];

/**
 * The Lessons tab's segments — teaching and competing.
 *
 * NO MENU SCREEN (CLAUDE.md, "No menu screens"). Every role has three or fewer
 * of these, so they are a segmented control at the top of the tab, not rows on
 * a landing page; `lessonSegments` builds it. The FIRST visible entry is what
 * /lessons itself shows, which is why two entries share the "/lessons" href:
 * an admin opens on Students, a family on its own lessons. Staff have no
 * /lessons view of their own and are sent to Shows.
 *
 * The old addresses (/manage/lesson-templates, /lessons/mine, /lessons/makeups)
 * redirect here. A family's makeup offers now sit at the top of its lessons —
 * they are about those lessons, and they are also pushed to Home.
 */
export const LESSONS_GROUP: DestinationGroup = {
  title: "Lessons and shows",
  entries: [
    {
      flag: "lessons",
      href: "/lessons",
      title: "My lessons",
      icon: "calendar",
      roles: ["parent"],
    },
    {
      flag: "lessons",
      href: "/lessons",
      title: "Students",
      icon: "people",
      roles: ADMIN,
    },
    {
      flag: "shows",
      href: "/lessons/shows",
      title: "Shows",
      icon: "ribbon",
      roles: ALL,
    },
    // Learning modules (0023). Every role is SHOWN the row; what each sees
    // inside is RLS's decision (a family only the modules shared with it).
    {
      flag: "learning",
      href: "/lessons/learn",
      title: "Learning",
      barnLabel: "learning",
      icon: "play",
      roles: ALL,
    },
  ],
};

export type Segment = { href: string; label: string; current: boolean };

/**
 * The Lessons segmented control for one role. `current` is the href of the
 * screen being rendered — passed in, not read from the URL, because /lessons
 * shows a different first segment per role.
 */
export function lessonSegments(
  role: Role,
  isEnabled: (flag: BarnFeatureFlag) => boolean,
  current: string,
  labels?: Partial<BarnLabels>,
): Segment[] {
  return visibleEntries(LESSONS_GROUP, role, isEnabled).map((entry) => ({
    href: entry.href,
    label: labelFor(entry, labels),
    current: entry.href === current,
  }));
}

/**
 * Settings (the More tab) — running the barn's people. Team & access leads:
 * adding a person, changing what they can see and revoking a login are the
 * three things that are urgent when they come up.
 */
export const SETTINGS_ADMIN_GROUP: DestinationGroup = {
  title: "Barn admin",
  entries: [
    {
      href: "/manage/team",
      title: "Team and access",
      icon: "people",
      roles: ADMIN,
    },
    {
      flag: "clockIn",
      href: "/manage/timesheets",
      title: "Clock-ins and timesheets",
      icon: "clock",
      roles: ADMIN,
    },
  ],
};

/** Settings (the More tab) — your own things. */
export const SETTINGS_YOURS_GROUP: DestinationGroup = {
  title: "Personal",
  entries: [
    {
      flag: "clockIn",
      href: "/more/timesheet",
      title: "My timesheet",
      icon: "clock",
      roles: BARN_SIDE,
    },
    // One screen, two framings: a family reads its own horses, the barn reads
    // the directory. RLS decides which rows either of them gets.
    {
      flag: "horses",
      href: "/more/horses",
      title: "Your horses",
      icon: "horse",
      roles: ["parent"],
    },
    {
      flag: "horses",
      href: "/more/horses",
      title: "Horse directory",
      icon: "horse",
      roles: BARN_SIDE,
    },
    {
      flag: "forms",
      href: "/more/forms",
      title: "Forms",
      icon: "document",
      roles: ["parent"],
    },
  ],
};

/** Strips `?query` and `#hash`, which the gate does not read. */
export function pathOf(href: string): string {
  return href.split(/[?#]/, 1)[0];
}

/**
 * The entries of `group` that `role` is shown. The one filter every landing
 * page and the sidebar use, so "who sees this row" is answered once.
 *
 * `isEnabled` is passed in rather than imported, so this file stays loadable
 * outside the bundler (see the note at the top).
 */
export function visibleEntries(
  group: DestinationGroup,
  role: Role,
  isEnabled: (flag: BarnFeatureFlag) => boolean,
): Destination[] {
  return group.entries.filter(
    (entry) =>
      entry.roles.includes(role) &&
      (!entry.flag || isEnabled(entry.flag)) &&
      roleCanAccess(role, pathOf(entry.href)),
  );
}

// ---------------------------------------------------------------------------
// The desktop sidebar.
// ---------------------------------------------------------------------------

export type SidebarIcon = { kind: "path"; d: string } | { kind: "icon"; name: IconName };
export type SidebarLink = { href: string; label: string; icon: SidebarIcon };
export type SidebarSection = { title: string | null; links: SidebarLink[] };
export type SidebarModel = { sections: SidebarSection[]; footer: SidebarLink[] };

/**
 * The sidebar for `role`, DERIVED — never written out by hand.
 *
 * Its sources are the tab list and the destination groups above, which are
 * exactly what the bottom bar and the landing pages render, and every link
 * passes through `roleCanAccess` on the way in. So the sidebar cannot offer a
 * role a link the gate refuses, and cannot invent a destination the gate has
 * never heard of. tests/nav.test.mjs proves both, for every role.
 *
 * GROUPING. Desktop has no five-destination limit, which is the whole point:
 * the screens a landing page hides one tap down are listed directly.
 *   (no heading)      the four subject tabs, so the mobile mental model holds
 *   Office            admin's people-and-paperwork work, first, because it is
 *                     the desk work a laptop is opened for (DESIGN-MASTER §14b)
 *   Today / Horses / Operations / Lessons and shows
 *                     the aisle work, in the same order as the landing pages
 *   Personal          the viewer's own records
 *   footer            Settings (the More tab) and sign-out, by the account
 * A destination listed in two groups appears once, in the first group that
 * has it. A group with nothing left for this role does not render.
 */
export function sidebarFor(
  role: Role,
  isEnabled: (flag: BarnFeatureFlag) => boolean,
  labels?: Partial<BarnLabels>,
): SidebarModel {
  const seen = new Set<string>();

  const take = (links: SidebarLink[]): SidebarLink[] =>
    links.filter((link) => {
      if (!roleCanAccess(role, pathOf(link.href)) || seen.has(link.href)) return false;
      seen.add(link.href);
      return true;
    });

  const fromGroups = (groups: DestinationGroup[]): SidebarLink[] =>
    groups.flatMap((group) =>
      visibleEntries(group, role, isEnabled).map((entry) => ({
        href: entry.href,
        label: labelFor(entry, labels),
        icon: { kind: "icon" as const, name: entry.icon },
      })),
    );

  // The More tab is the footer's Settings link, beside the account it belongs to.
  const tabs = TABS_BY_ROLE[role];
  const settingsTab = tabs.find((tab) => tab.href === "/more");
  const footer = take(
    settingsTab
      ? [{ href: settingsTab.href, label: "Settings", icon: { kind: "path", d: settingsTab.icon } }]
      : [],
  );

  const sections: SidebarSection[] = [
    {
      title: null,
      links: take(
        tabs
          .filter((tab) => tab.href !== "/more")
          .map((tab) => ({ href: tab.href, label: tab.label, icon: { kind: "path", d: tab.icon } })),
      ),
    },
    { title: "Office", links: take(fromGroups([SETTINGS_ADMIN_GROUP, BARN_RECORDS])) },
    { title: "Today", links: take(fromGroups([BARN_TODAY])) },
    { title: "Horses", links: take(fromGroups([BARN_HORSES])) },
    { title: "Operations", links: take(fromGroups([BARN_OPERATIONS])) },
    { title: "Lessons and shows", links: take(fromGroups([LESSONS_GROUP])) },
    { title: "Personal", links: take(fromGroups([SETTINGS_YOURS_GROUP])) },
  ].filter((section) => section.links.length > 0);

  return { sections, footer };
}

/**
 * Which sidebar link is the current one: the LONGEST href that `pathname`
 * equals or sits under, so /barn/water marks Water rather than Barn,
 * and exactly one link is ever current.
 */
export function currentHref(hrefs: string[], pathname: string): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const path = pathOf(href);
    if (pathname === path || pathname.startsWith(`${path}/`)) {
      if (!best || path.length > pathOf(best).length) best = href;
    }
  }
  return best;
}
