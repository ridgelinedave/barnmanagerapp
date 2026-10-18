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
 * VISUAL. The masthead is the same deep oxblood plane under the same gold
 * hairline as the AppHeader beside it, so the top of the window reads as one
 * bar, and the oxblood stays the ONE deep plane. The rail itself is white with
 * a hairline: light chrome, the accent reserved for "you are here".
 *
 * THE CURRENT PAGE IS NOT SIGNALLED BY COLOUR ALONE: `aria-current="page"`, a
 * 3px accent rule on the leading edge, and a weight change. accent-text on
 * accent-tint is 13.27:1; ink and muted on white are 15+:1 and 6.34:1.
 *
 * Rows are 44px tall, because an iPad in landscape gets this shell and is
 * still a touch screen.
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
        className="flex h-[4.625rem] shrink-0 items-center gap-3 border-b-2 border-gold bg-deep px-4"
      >
        <Image src={barn.brand.logoSrc} alt="" width={36} height={36} priority className="size-9 shrink-0" />
        <p className="min-w-0 truncate font-display text-heading text-white">{barn.name}</p>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4 pt-3">
        {model.sections.map((section, index) => (
          <div key={section.title ?? `section-${index}`} className={index === 0 ? "" : "pt-4"}>
            {section.title && (
              <h2 className="px-3 pb-1.5 font-display text-eyebrow uppercase text-muted">{section.title}</h2>
            )}
            <ul className="flex flex-col gap-0.5">
              {section.links.map((link) => (
                <li key={link.href}>
                  <SidebarRow link={link} current={link.href === current} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line px-3 py-3">
        <div className="flex items-center gap-3 px-3 pb-2">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent font-display text-heading font-bold text-accent-on"
          >
            {account.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-label font-semibold text-ink">{account.name}</span>
            <span className="block truncate text-caption capitalize text-muted">{account.detail}</span>
          </span>
        </div>
        <ul className="flex flex-col gap-0.5">
          {model.footer.map((link) => (
            <li key={link.href}>
              <SidebarRow link={link} current={link.href === current} />
            </li>
          ))}
          <li>
            <form action="/auth/sign-out" method="post">
              <button type="submit" className={rowClass(false)}>
                <span aria-hidden="true" className="flex size-5 shrink-0" />
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
  return `flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-label transition-colors duration-150 ease-out ${
    current
      ? "bg-accent-tint font-semibold text-accent-text shadow-[inset_3px_0_0_var(--accent)]"
      : "font-medium text-ink hover:bg-sunk"
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
  const tone = current ? "text-accent-text" : "text-muted";
  if (icon.kind === "icon") {
    return <Icon name={icon.name} className={`size-5 shrink-0 ${tone}`} />;
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
      className={`size-5 shrink-0 ${tone}`}
    >
      <path d={icon.d} />
    </svg>
  );
}
