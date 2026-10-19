import Link from "next/link";

/**
 * A screen's sub-views — Day / Month / Agenda, a pay period, Upcoming /
 * Results. Links, not buttons: each view is its own URL, so it can be shared,
 * survives a refresh, and the server renders it.
 *
 * TWO REGISTERS from one component:
 *   phone    a full-width segmented control, 44px targets, under the thumb
 *   desktop  underline tabs in the page header, under the title
 *
 * The current view is NAVIGATION, so it is one of the two places the accent is
 * allowed (DESIGN-MASTER: primary buttons and the active nav, nowhere else) —
 * and it is never colour alone: `aria-current`, weight, and the fill or rule.
 */
export function SubTabs({
  label,
  items,
}: {
  /** Names the navigation for a screen reader: "Schedule view", "Pay period". */
  label: string;
  items: { href: string; label: string; current: boolean }[];
}) {
  return (
    <nav aria-label={label}>
      <ul className="flex gap-1 rounded-control border border-line bg-sunk p-1 lg:gap-6 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
        {items.map((item) => (
          <li key={item.href} className="flex-1 lg:flex-none">
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              scroll={false}
              className={`flex min-h-11 items-center justify-center whitespace-nowrap rounded-control px-2 text-label transition-colors duration-150 lg:min-h-0 lg:rounded-none lg:border-b-2 lg:px-0 lg:pb-2 lg:pt-1 lg:text-table ${
                item.current
                  ? "bg-accent font-semibold text-accent-on lg:border-accent lg:bg-transparent lg:text-ink"
                  : "font-medium text-ink lg:border-transparent lg:text-muted lg:hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
