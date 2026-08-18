import type { Role } from "@/lib/types";

/**
 * Role-driven bottom navigation.
 *
 * The same `role` value that renders these tabs is what the RLS policies check,
 * so UI and security cannot disagree (SPEC §3.2). Max 5 tabs per role (SPEC §7).
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
