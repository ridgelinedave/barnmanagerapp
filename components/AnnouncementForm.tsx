"use client";

import { useActionState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { CheckRow, Field, FormFeedback, Input, Textarea } from "@/components/ui/Field";
import type { ActionState } from "@/app/(app)/manage/announcements/actions";
import type { Announcement } from "@/lib/types";

/**
 * Compose / edit form. Bottom-sheet style, 44px+ touch targets, one column —
 * Belle runs the barn from her phone (SPEC §7).
 */
export function AnnouncementForm({
  action,
  announcement,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  announcement?: Announcement;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {
    error: null,
  });

  const alreadyNotified = Boolean(announcement?.notified_at);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {announcement && <input type="hidden" name="id" value={announcement.id} />}

      <Field label="Title" htmlFor="title">
        <Input
          id="title"
          name="title"
          required
          maxLength={200}
          defaultValue={announcement?.title ?? ""}
        />
      </Field>

      <Field label="Message" htmlFor="body_md">
        <Textarea id="body_md" name="body_md" rows={6} defaultValue={announcement?.body_md ?? ""} />
      </Field>

      {/*
       * Audience is a radio group with the consequence spelled out under each
       * option, not a checkbox called "internal". This is the control that
       * decides whether forty families get a notification.
       */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-label font-medium text-ink">Who sees this</legend>
        {(
          [
            ["all", "Everyone", "Families and staff."],
            ["staff", "Staff only", "Internal. Parents never see it."],
          ] as const
        ).map(([value, label, hint]) => (
          <label
            key={value}
            className="flex min-h-12 items-start gap-3 rounded-control border border-line bg-surface p-3"
          >
            <input
              type="radio"
              name="audience"
              value={value}
              defaultChecked={(announcement?.audience ?? "all") === value}
              className="mt-0.5 size-5 accent-[var(--brand-gold-deep)]"
            />
            <span className="min-w-0">
              <span className="block text-body font-semibold text-ink">{label}</span>
              <span className="block text-caption text-muted">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <CheckRow label="Pin to the top" name="pinned" defaultChecked={announcement?.pinned ?? false} />

      <label className="flex min-h-12 items-start gap-3 rounded-control border border-line bg-surface p-3">
        <input
          type="checkbox"
          name="notify"
          defaultChecked={announcement?.notify ?? false}
          disabled={alreadyNotified}
          className="mt-0.5 size-5 accent-[var(--brand-gold-deep)] disabled:opacity-50"
        />
        <span className="min-w-0">
          <span className="block text-body text-ink">Send a notification</span>
          <span className="block text-caption text-muted">
            {alreadyNotified
              ? "Already sent. Editing won't notify anyone again."
              : "Adds it to each recipient's bell. No email yet."}
          </span>
        </span>
      </label>

      <FormFeedback error={state.error} />

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending} className="flex-1">
          {pending ? "Saving…" : submitLabel}
        </Button>
        <ButtonLink href="/manage/announcements" variant="secondary">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
