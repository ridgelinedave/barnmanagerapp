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
  ribbon:
    "M12 3a5.25 5.25 0 1 0 0 10.5A5.25 5.25 0 0 0 12 3Zm-3.2 9.6L6.5 21l5.5-2.75L17.5 21l-2.3-8.4",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.5V12l3.25 2",
  checklist: "M4 7h2.5M4 12h2.5M4 17h2.5M10 7h10M10 12h10M10 17h10",
  grid: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
} as const;

const HOME: Tab = { href: "/home", label: "Home", icon: ICONS.home };
const MORE: Tab = { href: "/more", label: "More", icon: ICONS.more };

export const TABS_BY_ROLE: Record<Role, Tab[]> = {
  parent: [
    HOME,
    { href: "/lessons", label: "Lessons", icon: ICONS.calendar },
    { href: "/shows", label: "Shows", icon: ICONS.ribbon },
    MORE,
  ],
  staff: [
    HOME,
    { href: "/clock", label: "Clock", icon: ICONS.clock },
    { href: "/tasks", label: "Tasks", icon: ICONS.checklist },
    { href: "/schedule", label: "Schedule", icon: ICONS.calendar },
    MORE,
  ],
  admin: [
    HOME,
    { href: "/schedule", label: "Schedule", icon: ICONS.calendar },
    { href: "/manage", label: "Manage", icon: ICONS.grid },
    { href: "/shows", label: "Shows", icon: ICONS.ribbon },
    MORE,
  ],
};

/** True when `role` is allowed to see `pathname`. Keeps stub routes role-scoped. */
export function roleCanAccess(role: Role, pathname: string): boolean {
  return TABS_BY_ROLE[role].some(
    (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`),
  );
}
