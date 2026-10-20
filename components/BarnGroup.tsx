"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * A group on the Barn tab: a LABEL over rows, not another row.
 *
 * The group heading used to be Marcellus over a rule, and so was every row
 * beneath it — same face, same colour, same ground — so "Today" read as one
 * more destination. The heading is now scaffolding: Barlow Condensed small
 * caps, tracked, accent-text on an accent-tint band (13.27:1). The rows keep
 * Marcellus, so the eye lands on the destinations and the band says where one
 * set ends.
 *
 * COLLAPSIBLE ON A PHONE ONLY. Below lg the band is a disclosure button (44px+
 * target, aria-expanded, a chevron that turns). Open is the default, and a
 * viewer's choice is remembered in localStorage — read after mount so the
 * server render and the first client render agree, and wrapped in try/catch
 * because storage can throw (private mode, blocked site data). On the desktop
 * the sidebar already lists everything and there is room: always expanded, a
 * plain heading, no control.
 */
export function BarnGroup({
  title,
  storageKey,
  children,
}: {
  title: string;
  /** Per viewer and per group, e.g. "barn-group:admin:Today". */
  storageKey: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a stored preference after mount, by design
      if (saved === "closed") setOpen(false);
    } catch {
      /* storage unavailable: stay open */
    }
  }, [storageKey]);

  const toggle = () => {
    setOpen((was) => {
      const next = !was;
      try {
        window.localStorage.setItem(storageKey, next ? "open" : "closed");
      } catch {
        /* storage unavailable: the choice lasts for this visit */
      }
      return next;
    });
  };

  const band =
    "flex min-h-11 w-full items-center gap-2 rounded-control bg-accent-tint px-3 " +
    "font-condensed text-label font-semibold uppercase tracking-[0.14em] text-accent-text";

  return (
    <section className="flex flex-col gap-1">
      <h2 className="lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
          className={`${band} text-left`}
        >
          <span className="min-w-0 flex-1">{title}</span>
          <Icon
            name="chevron"
            className={`size-4 shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
          />
        </button>
      </h2>
      <h2 className={`hidden lg:flex ${band}`}>{title}</h2>

      <div id={bodyId} className={open ? "" : "max-lg:hidden"}>
        {children}
      </div>
    </section>
  );
}
