"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * The "⋯" menu: the row's secondary actions, out of the way until asked for.
 *
 * A 44px button at EVERY width (the touch floor is non-negotiable for this
 * control, desk included), `aria-haspopup="menu"` and `aria-expanded`. The
 * menu is `role="menu"` with `menuitem`s, 44px each:
 *   open        focus moves to the first item
 *   ↑ ↓         move between items (wrapping); Home / End to the ends
 *   Escape      closes, focus back on the ⋯ button
 *   Tab, or a click outside, closes it
 * Choosing an item closes the menu, then runs it — so an item that opens a
 * file picker (`input.click()`) still runs inside the user's click.
 *
 * A DANGER item is red text — the only place a delete appears; it leads to
 * the app's normal inline confirm, never straight to a deletion.
 *
 * `hideFrom: "lg"` keeps an item to the phone (Move up / Move down, which the
 * desk does by drag or the arrow keys on the handle).
 */
export type MenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  hideFrom?: "lg";
};

/** The menu's items that are showing (an `lg:hidden` one is not, on a desk). */
function itemsIn(root: HTMLElement | null): HTMLButtonElement[] {
  return [...(root?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])].filter((el) => el.offsetParent !== null);
}

export function OverflowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    itemsIn(wrap.current)[0]?.focus();
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = itemsIn(wrap.current);
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      list[(at + step + list.length) % list.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      list[e.key === "Home" ? 0 : list.length - 1]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex size-11 items-center justify-center rounded-control text-muted transition-colors duration-150 hover:bg-sunk hover:text-ink aria-expanded:bg-sunk aria-expanded:text-ink"
      >
        <Icon name="more" className="size-5" strokeWidth={3} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-40 mt-1 flex min-w-44 flex-col rounded-control border border-line bg-surface py-1 shadow-[0_6px_20px_rgb(0_0_0/0.12)]"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(false);
                item.onSelect();
              }}
              className={`flex min-h-11 items-center whitespace-nowrap px-4 text-left text-[0.9375rem] font-medium hover:bg-sunk focus-visible:bg-sunk ${
                item.danger ? "text-danger" : "text-ink"
              } ${item.hideFrom === "lg" ? "lg:hidden" : ""}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
