import type { ReactNode } from "react";
import Link from "next/link";

/**
 * The desktop shell's data table (DESIGN-MASTER §14b: "tables are correct and
 * wanted here").
 *
 * WHAT IT IS: 13px text, ~40px rows, hairline separators, a whole-row hover,
 * column headers in the 11px uppercase label, and numbers in tabular figures,
 * right-aligned, always. No zebra stripes, no card around it, no shadow — the
 * hairlines are the structure.
 *
 * WHERE IT IS: the DESKTOP shell only. A screen renders its phone cards inside
 * `lg:hidden` and this inside `hidden lg:block` — the same data, two registers.
 * A table on a 320px phone is still wrong.
 *
 * SORTING is a link, not client state: a sortable header points at the same
 * screen with `?sort=<column>&dir=<asc|desc>`, and the page sorts on the
 * server with `sortRows()`. So a sorted view can be bookmarked, survives a
 * refresh, and needs no JavaScript. The current sort is announced with
 * `aria-sort` on the header, not just shown with an arrow.
 *
 * A ROW LINK covers the whole row (a stretched link on the first cell), so the
 * row is the target, as it is on the phone — but it is still ONE link per row
 * in the tab order, not one per cell.
 */

export type SortDir = "asc" | "desc";

export type Column = {
  key: string;
  label: string;
  /** Right-aligned, tabular figures. Use for every count, hour, score, date-as-number. */
  numeric?: boolean;
  sortable?: boolean;
  /** Extra classes for the column (width, wrapping). */
  className?: string;
  /** Visually hidden header — an actions column still needs a name for a screen reader. */
  hideLabel?: boolean;
};

export type Row = {
  key: string;
  cells: Record<string, ReactNode>;
  /** Values `sortRows()` compares, per sortable column key. */
  sort?: Record<string, string | number | null | undefined>;
  /** Whole-row link. */
  href?: string;
  /** Quiet row — retired, inactive, closed. */
  muted?: boolean;
};

export type SortState = {
  key: string;
  dir: SortDir;
  /** Builds the href for a header link. */
  href: (key: string, dir: SortDir) => string;
};

/** Reads `?sort=&dir=`, falling back to a default and refusing unknown keys. */
export function parseSort(
  params: { sort?: string; dir?: string },
  allowed: string[],
  fallback: { key: string; dir: SortDir },
): { key: string; dir: SortDir } {
  const key = params.sort && allowed.includes(params.sort) ? params.sort : fallback.key;
  const dir = params.dir === "asc" || params.dir === "desc" ? params.dir : fallback.dir;
  return { key, dir };
}

/** A stable sort on the row's `sort` values. Blanks sort last in both directions. */
export function sortRows(rows: Row[], key: string, dir: SortDir): Row[] {
  const factor = dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const x = a.row.sort?.[key];
      const y = b.row.sort?.[key];
      const xBlank = x === null || x === undefined || x === "";
      const yBlank = y === null || y === undefined || y === "";
      if (xBlank && yBlank) return a.index - b.index;
      if (xBlank) return 1;
      if (yBlank) return -1;
      const order =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
      return order === 0 ? a.index - b.index : order * factor;
    })
    .map(({ row }) => row);
}

/** Builds a sort-href function that keeps every other query param. */
export function sortHrefFor(
  path: string,
  params: Record<string, string | string[] | undefined>,
): (key: string, dir: SortDir) => string {
  return (key, dir) => {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) {
      if (name === "sort" || name === "dir" || value === undefined) continue;
      for (const v of Array.isArray(value) ? value : [value]) query.append(name, v);
    }
    query.set("sort", key);
    query.set("dir", dir);
    return `${path}?${query.toString()}`;
  };
}

const HEADER =
  "border-b border-line px-3 py-2 text-left align-bottom font-condensed text-micro uppercase text-muted";

export function DataTable({
  caption,
  columns,
  rows,
  sort,
  empty,
}: {
  /** Names the table for a screen reader. Visually hidden — the section label shows it. */
  caption: string;
  columns: Column[];
  rows: Row[];
  sort?: SortState;
  /** What to say when there are no rows: one short sentence. */
  empty?: ReactNode;
}) {
  if (rows.length === 0 && empty) {
    return <div className="py-1 text-table text-muted">{empty}</div>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-table text-ink">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key;
              const align = column.numeric ? "text-right" : "text-left";
              const label = column.hideLabel ? <span className="sr-only">{column.label}</span> : column.label;

              if (!sort || !column.sortable) {
                return (
                  <th key={column.key} scope="col" className={`${HEADER} ${align} ${column.className ?? ""}`}>
                    {label}
                  </th>
                );
              }

              const nextDir: SortDir = active && sort.dir === "asc" ? "desc" : "asc";
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                  className={`${HEADER} ${align} ${column.className ?? ""}`}
                >
                  <Link
                    href={sort.href(column.key, nextDir)}
                    scroll={false}
                    className={`inline-flex items-center gap-1 hover:text-ink ${active ? "text-ink" : ""} ${column.numeric ? "flex-row-reverse" : ""}`}
                  >
                    {label}
                    <span aria-hidden="true" className={active ? "" : "opacity-0"}>
                      {active && sort.dir === "desc" ? "↓" : "↑"}
                    </span>
                  </Link>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className={`relative border-b border-line transition-colors duration-100 hover:bg-surface ${row.muted ? "text-muted" : ""}`}
            >
              {columns.map((column, index) => {
                const content = row.cells[column.key];
                const cellClass = `h-10 px-3 py-1.5 align-middle ${column.numeric ? "text-right tabular-nums" : ""} ${column.className ?? ""}`;
                if (index === 0 && row.href) {
                  return (
                    <td key={column.key} className={cellClass}>
                      {/* The stretched link: its ::after covers the row, so the
                          whole row is the target. Controls in later cells sit
                          above it with `relative z-10`. */}
                      <Link
                        href={row.href}
                        className="font-semibold after:absolute after:inset-0 after:content-[''] hover:underline"
                      >
                        {content}
                      </Link>
                    </td>
                  );
                }
                return (
                  <td key={column.key} className={`${cellClass} ${index === 0 ? "font-semibold" : ""}`}>
                    {/* relative z-10 keeps any control in a cell clickable over a row link. */}
                    <span className="relative z-10">{content}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The phone register's half of a screen that has a table on desktop. */
export const MOBILE_ONLY = "lg:hidden";
/** The desktop register's half. */
export const DESKTOP_ONLY = "hidden lg:block";
