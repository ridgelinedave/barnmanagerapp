"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { barn } from "@/config/barn";
import { Icon } from "@/components/ui/Icon";
import { initialOf } from "@/components/ui/ListRow";
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
 * VISUAL (2026-11-11, David's UI pass). The rail is the barn's deep oxblood
 * (`deep`, #4A002A) from top to bottom; nav labels white, group labels small
 * caps in the light tint. THE CURRENT PAGE is the accent fill (#6E1A3D) with
 * white text, a 3px gold bar on the left (decorative — gold is never text),
 * a full-white icon and `aria-current="page"` — not colour alone. Other icons
 * are white at reduced opacity. Measured (WCAG, on #4A002A unless noted):
 *   white label               15.85:1   (on the #6E1A3D current row 11.18:1)
 *   tint group label #F1E9E9  13.27:1
 *   white/70 icon              8.07:1   (6.77:1 on hover; a graphic needs 3:1)
 *   white on the hover fill   13.31:1   (white/8 over the deep ground)
 *   gold focus ring            7.22:1   (5.09:1 on the current row; 3:1 needed)
 *
 * THE BRAND BLOCK is a LIGHT panel: the barn's full-colour crest is unreadable
 * on oxblood, and a barn's logo is never recoloured or filtered. So: white
 * panel, crest, the barn name in Marcellus in the accent text colour — as on
 * the sign-in screen. If config supplies `brand.logoReversedSrc` (a logo made
 * for a dark ground), that is used on the oxblood instead and the panel goes.
 *
 * ROWS ARE 40px (David, 2026-11-11). The nav scrolls on its own when the list
 * is taller than the window — the brand block stays at the top and the
 * profile block stays pinned at the bottom — and on load the current page is
 * scrolled into view inside it. 40px is below the 44px touch floor, by
 * decision: this shell is the desk register, and the 44px rules belong to the
 * mobile shell. An iPad in LANDSCAPE (1024px+) gets this shell; if Belle's
 * staff use one that way in the aisle, the breakpoint is the thing to move.
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

  // The current row, scrolled into view inside the nav (never the page) when
  // it is outside the visible part of the list.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const row = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !row) return;
    const top = row.offsetTop; // the nav is the offset parent (`relative`)
    const bottom = top + row.offsetHeight;
    if (top < nav.scrollTop || bottom > nav.scrollTop + nav.clientHeight) {
      nav.scrollTop = Math.max(0, top - (nav.clientHeight - row.offsetHeight) / 2);
    }
  }, [current]);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-deep lg:flex">
      {barn.brand.logoReversedSrc ? (
        <div data-plane="deep" className="flex h-[4.5625rem] shrink-0 items-center gap-3 border-b border-white/15 px-4">
          <Image src={barn.brand.logoReversedSrc} alt="" width={36} height={36} priority className="size-9 shrink-0 object-contain" />
          <p className="min-w-0 truncate font-display text-heading text-white">{barn.name}</p>
        </div>
      ) : (
        <div className="flex h-[4.5625rem] shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
          <Image src={barn.brand.logoSrc} alt="" width={40} height={40} priority className="size-10 shrink-0 object-contain" />
          <p className="min-w-0 truncate font-display text-heading text-accent-text">{barn.name}</p>
        </div>
      )}

      <nav ref={navRef} aria-label="Main" data-plane="deep" className="relative min-h-0 flex-1 overflow-y-auto pb-4 pt-3 [scrollbar-color:rgb(255_255_255/0.25)_transparent]">
        {model.sections.map((section, index) => (
          <div key={section.title ?? `section-${index}`} className={index === 0 ? "" : "pt-5"}>
            {section.title && (
              <h2 className="px-4 pb-1 font-condensed text-micro uppercase text-accent-tint">{section.title}</h2>
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

      <div data-plane="deep" className="shrink-0 border-t border-white/15 py-3">
        <div className="flex items-center gap-2.5 px-4 pb-2">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/15 font-display text-label text-white"
          >
            {initialOf(account.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-table font-semibold text-white">{account.name}</span>
            <span className="block truncate font-condensed text-micro normal-case tracking-normal text-accent-tint">
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
  // The bar is always 3px so the label does not shift when a row becomes
  // current; only its colour changes (transparent → gold).
  return `flex min-h-10 w-full items-center gap-2.5 border-l-[3px] py-1 pl-[0.8125rem] pr-4 text-left text-table text-white transition-colors duration-150 ease-out ${
    current ? "border-gold bg-accent font-semibold" : "border-transparent font-medium hover:bg-white/8"
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
  const tone = current ? "text-white" : "text-white/70";
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
