"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { barn } from "@/config/barn";
import { Icon } from "@/components/ui/Icon";
import { currentHref, type SidebarIcon, type SidebarLink, type SidebarModel } from "@/lib/nav";

/**
 * The desktop shell's navigation: a persistent sidebar, from the `lg`
 * breakpoint up (DESIGN-MASTER §14b). Below it this renders nothing visible
 * and the five-tab bar is the navigation, exactly as before.
 *
 * NOTHING HERE DECIDES ACCESS. `model` comes from `sidebarFor()` in lib/nav.ts,
 * which derives it from the same tab and destination lists the bottom bar and
 * the landing pages render, filtered through `roleCanAccess`. This component
 * only draws it. Every screen it links to still guards itself.
 *
 * It lives in the app layout, which the App Router keeps mounted across
 * navigation, so it never re-renders from scratch between screens — the
 * desktop app feels like an app rather than a site, and the loading fallback
 * only ever replaces the content area beside it.
 *
 * VISUAL. The masthead is the barn's deep oxblood plane under the gold
 * hairline — on the desktop shell the ONLY deep plane, since the page header
 * beside it is light. The rail is white with a hairline.
 *
 * DENSE, LIKE THE TOOL IT IS: group labels in the 11px uppercase label, rows
 * ~32px, 13px text. THE CURRENT PAGE is an oxblood left border plus the blush
 * tint, a weight change and `aria-current="page"` — not a pill, and not colour
 * alone. Ink on the blush tint is 15+:1; muted on white is 6.34:1.
 *
 * 32px rows are below the 44px touch floor. That is deliberate and recorded:
 * this shell is the desk register, and the 44px rules belong to the mobile
 * shell. An iPad in LANDSCAPE (1024px+) gets this shell; if Belle's staff use
 * one that way in the aisle, the breakpoint is the thing to move, not the rows.
 */
export function Sidebar({
  model,
  account,
}: {
  model: SidebarModel;
  account: { name: string; detail: string };
}) {
  const pathname = usePathname();
  const all = [...model.sections.flatMap((section) => section.links), ...model.footer];
  const current = currentHref(
    all.map((link) => link.href),
    pathname,
  );

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
      <div
        data-plane="deep"
        className="flex h-[4.5625rem] shrink-0 items-center gap-3 border-b-2 border-gold bg-deep px-4"
      >
        <Image src={barn.brand.logoSrc} alt="" width={36} height={36} priority className="size-9 shrink-0" />
        <p className="min-w-0 truncate font-display text-heading text-white">{barn.name}</p>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto pb-4 pt-3">
        {model.sections.map((section, index) => (
          <div key={section.title ?? `section-${index}`} className={index === 0 ? "" : "pt-5"}>
            {section.title && (
              <h2 className="px-4 pb-1 font-sans text-micro uppercase text-muted">{section.title}</h2>
            )}
            <ul className="flex flex-col">
              {section.links.map((link) => (
                <li key={link.href}>
                  <SidebarRow link={link} current={link.href === current} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line py-3">
        <div className="flex items-center gap-2.5 px-4 pb-2">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-avatar border border-line bg-sunk font-display text-label font-bold text-ink"
          >
            {account.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-table font-semibold text-ink">{account.name}</span>
            <span className="block truncate text-micro normal-case tracking-normal text-muted">
              <span className="capitalize">{account.detail}</span>
            </span>
          </span>
        </div>
        <ul className="flex flex-col">
          {model.footer.map((link) => (
            <li key={link.href}>
              <SidebarRow link={link} current={link.href === current} />
            </li>
          ))}
          <li>
            <form action="/auth/sign-out" method="post">
              <button type="submit" className={rowClass(false)}>
                <span aria-hidden="true" className="flex size-4 shrink-0" />
                Sign out
              </button>
            </form>
          </li>
        </ul>
      </div>
    </aside>
  );
}

function rowClass(current: boolean): string {
  // The border is always 2px so the label does not shift by 2px when a row
  // becomes current; only its colour changes.
  return `flex min-h-8 w-full items-center gap-2.5 border-l-2 py-1 pl-[0.875rem] pr-4 text-left text-table transition-colors duration-150 ease-out ${
    current
      ? "border-accent bg-accent-tint font-semibold text-ink"
      : "border-transparent font-medium text-ink hover:bg-sunk"
  }`;
}

function SidebarRow({ link, current }: { link: SidebarLink; current: boolean }) {
  return (
    <Link href={link.href} aria-current={current ? "page" : undefined} className={rowClass(current)}>
      <RowIcon icon={link.icon} current={current} />
      <span className="min-w-0 truncate">{link.label}</span>
    </Link>
  );
}

function RowIcon({ icon, current }: { icon: SidebarIcon; current: boolean }) {
  const tone = current ? "text-ink" : "text-muted";
  if (icon.kind === "icon") {
    return <Icon name={icon.name} className={`size-4 shrink-0 ${tone}`} />;
  }
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={current ? 2 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-4 shrink-0 ${tone}`}
    >
      <path d={icon.d} />
    </svg>
  );
}
