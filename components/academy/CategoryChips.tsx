import Link from "next/link";
import { SubTabs } from "@/components/ui/SubTabs";

/**
 * The category filter: "All" first, then the barn's own categories (editable
 * rows, 0028). Links, not client state — the server renders the filtered grid,
 * so a filter is shareable, survives a reload and works without JavaScript.
 *
 * On a phone the row scrolls sideways INSIDE ITSELF (the page never does —
 * no horizontal scroll at 320px), with the edge chips flush to the gutter.
 * Every chip is a 44px target. The current chip is the accent fill carrying
 * white; the rest are an ink/50 outline — the same pairing as the buttons.
 */
export function CategoryChips({
  categories,
  activeId,
  hrefFor,
}: {
  categories: { id: string; name: string }[];
  /** null = All. */
  activeId: string | null;
  hrefFor: (categoryId: string | null) => string;
}) {
  const chips = [{ id: null as string | null, name: "All" }, ...categories];

  return (
    <nav aria-label="Categories" className="-mx-4 lg:mx-0">
      <ul className="flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
        {chips.map((chip) => {
          const current = chip.id === activeId;
          return (
            <li key={chip.id ?? "all"} className="shrink-0 snap-start">
              <Link
                href={hrefFor(chip.id)}
                aria-current={current ? "page" : undefined}
                scroll={false}
                className={`flex min-h-11 items-center rounded-control border px-3.5 font-condensed text-label uppercase tracking-[0.08em] transition-colors duration-150 ${
                  current
                    ? "border-accent bg-accent font-semibold text-accent-on"
                    : "border-ink/50 bg-transparent font-medium text-ink lg:hover:bg-surface"
                }`}
              >
                {chip.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** All courses / My courses — the app's one segmented control (SubTabs). */
export function CourseScopeToggle({
  scope,
  hrefFor,
}: {
  scope: "all" | "mine";
  hrefFor: (scope: "all" | "mine") => string;
}) {
  return (
    <SubTabs
      label="Courses"
      items={[
        { href: hrefFor("all"), label: "All courses", current: scope === "all" },
        { href: hrefFor("mine"), label: "My courses", current: scope === "mine" },
      ]}
    />
  );
}
