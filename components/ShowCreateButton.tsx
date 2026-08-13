"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Icon } from "@/components/ui/Icon";
import { ShowForm } from "@/components/ShowAdmin";

/**
 * "New show", in the masthead.
 *
 * A plus in the header rather than a button above the carousel: the hub opens
 * on the cards, and a full-width primary action pushing them below the fold
 * would put the barn's admin ahead of the thing everyone comes here to read.
 * The header slot is where this app already puts a screen's one contextual
 * control (see the Schedule tab's admin menu).
 *
 * Icon-only, so it carries an `aria-label` — a plus on its own means nothing
 * to a screen reader.
 */
export function ShowCreateButton({ today }: { today: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Add a show"
        className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-chip text-white"
      >
        <Icon name="plus" className="size-6" strokeWidth={2.5} />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="New show">
        <ShowForm today={today} />
      </Sheet>
    </>
  );
}
