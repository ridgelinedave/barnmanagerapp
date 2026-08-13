"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { GenerateInstancesButton } from "@/components/ScheduleAdmin";
import { SendRemindersButton } from "@/components/FillSlotForm";

/**
 * The admin overflow for the Schedule tab.
 *
 * WHY THESE MOVED OFF THE SCREEN. They used to sit in a panel headed "Run the
 * day" holding a primary-weight "Generate the next 4 weeks" — the loudest
 * control on a screen whose actual job is showing what is on today. Both the
 * heading and the label described the mechanism rather than the outcome, so
 * they read as cryptic to everyone except the person who wrote them, and they
 * outranked the day.
 *
 * They are still one tap away, behind a dot menu in the masthead: the tools an
 * admin reaches for occasionally, with labels that say what they do in plain
 * words. Nothing here is destructive, and nothing here is needed to read the
 * day, which is exactly why none of it belongs in the page body.
 */
export function ScheduleAdminMenu({ date, dayLabel }: { date: string; dayLabel: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Lesson admin tools"
        className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-chip text-white"
      >
        <Icon name="more" className="size-6" strokeWidth={2.5} />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Lesson admin">
        <div className="flex flex-col gap-2">
          <GenerateInstancesButton />
          <ButtonLink href="/manage/lesson-templates" size="menu" block icon="calendar">
            Edit the weekly schedule
          </ButtonLink>
          <SendRemindersButton date={date} dayLabel={dayLabel} />
        </div>
      </Sheet>
    </>
  );
}
