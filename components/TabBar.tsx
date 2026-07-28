"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS_BY_ROLE } from "@/lib/nav";
import type { Role } from "@/lib/types";

/** Fixed bottom tab bar. Max 5 tabs; 44px minimum touch targets (SPEC §7). */
export function TabBar({ role }: { role: Role }) {
  const pathname = usePathname();
  const tabs = TABS_BY_ROLE[role];

  return (
    <nav
      aria-label="Main"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-brand-ink/10 bg-white"
    >
      <ul className="mx-auto flex max-w-screen-sm">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium ${
                  active ? "text-brand-gold" : "text-brand-ink/60"
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
                  className="size-6"
                >
                  <path d={tab.icon} />
                </svg>
                <span className="truncate">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
