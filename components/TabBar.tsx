"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS_BY_ROLE } from "@/lib/nav";
import type { Role } from "@/lib/types";

/**
 * The bottom tab bar.
 *
 * Charcoal, matching the header, so the app is framed top and bottom by the
 * barn's own colour and the paper-white content sits between them like a page on a
 * board.
 *
 * The active tab gets a gold pill behind the icon AND a gold label AND a
 * weight change — three signals, because "the active one is a slightly
 * different grey" is how people end up unsure which screen they are on. Gold
 * on charcoal measures 9.26:1.
 *
 * Max 5 tabs; every target is 56px tall and a full fifth of the width.
 */
export function TabBar({ role }: { role: Role }) {
  const pathname = usePathname();
  const tabs = TABS_BY_ROLE[role];

  return (
    <nav
      aria-label="Main"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-chrome"
    >
      <ul className="mx-auto flex max-w-screen-sm">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2"
              >
                <span
                  className={`flex h-7 w-12 items-center justify-center rounded-chip transition-colors duration-150 ease-out ${
                    active ? "bg-gold/20" : "bg-transparent"
                  }`}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={active ? 2 : 1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`size-6 ${active ? "text-gold" : "text-white/65"}`}
                  >
                    <path d={tab.icon} />
                  </svg>
                </span>
                <span
                  className={`truncate text-[0.6875rem] leading-none ${
                    active ? "font-semibold text-gold" : "font-medium text-white/65"
                  }`}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
