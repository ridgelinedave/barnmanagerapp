"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { BannerForm, ShowForm } from "@/components/ShowAdmin";
import type { Show } from "@/lib/types";

/**
 * The barn's overflow on a show.
 *
 * Two things live here — editing the show's own facts, and its banner — and
 * neither belongs on the page body. This screen's job is to answer "who is
 * going and when do they ride"; an Edit panel parked above the roster would
 * push that below the fold for the staff who only ever read it.
 *
 * Roster and results keep their own inline controls, because those ARE the
 * screen. Only the show-level admin is behind the dots.
 *
 * One sheet at a time: opening Banner from inside the menu replaces the menu
 * rather than stacking a second dialog on top of it, which on iOS leaves two
 * backdrops and a scroll lock nobody can get out of.
 */
type Panel = "menu" | "details" | "banner";

export function ShowManageMenu({ show }: { show: Show }) {
  const [panel, setPanel] = useState<Panel | null>(null);

  const close = () => setPanel(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setPanel("menu")}
        aria-haspopup="dialog"
        aria-expanded={panel !== null}
        aria-label="Manage this show"
        className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-chip text-white"
      >
        <Icon name="more" className="size-6" strokeWidth={2.5} />
      </button>

      <Sheet open={panel === "menu"} onClose={close} title="Manage show">
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="menu"
            block
            icon="document"
            onClick={() => setPanel("details")}
          >
            Edit the show details
          </Button>
          <Button type="button" size="menu" block icon="pin" onClick={() => setPanel("banner")}>
            {show.image_path ? "Replace or remove the banner" : "Add a banner image"}
          </Button>
        </div>
      </Sheet>

      <Sheet open={panel === "details"} onClose={close} title={show.name}>
        <ShowForm show={show} today={show.start_date} />
      </Sheet>

      <Sheet open={panel === "banner"} onClose={close} title="Show banner">
        <BannerForm showId={show.id} hasBanner={Boolean(show.image_path)} />
      </Sheet>
    </>
  );
}
