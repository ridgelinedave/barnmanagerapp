"use client";

import Link from "next/link";
import { useActionState } from "react";
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={200}
          defaultValue={announcement?.title ?? ""}
          className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="body_md" className="text-sm font-medium">
          Message
        </label>
        <textarea
          id="body_md"
          name="body_md"
          rows={6}
          defaultValue={announcement?.body_md ?? ""}
          className="rounded-xl border border-brand-ink/20 bg-white p-3 text-base"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Who sees this</legend>
        {(
          [
            ["all", "Everyone", "Families and staff."],
            ["staff", "Staff only", "Internal. Parents never see it."],
          ] as const
        ).map(([value, label, hint]) => (
          <label
            key={value}
            className="flex min-h-12 items-start gap-3 rounded-xl border border-brand-ink/20 bg-white p-3"
          >
            <input
              type="radio"
              name="audience"
              value={value}
              defaultChecked={(announcement?.audience ?? "all") === value}
              className="mt-1 size-5 accent-[var(--brand-gold)]"
            />
            <span>
              <span className="block text-sm font-semibold">{label}</span>
              <span className="block text-xs text-brand-ink/60">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-brand-ink/20 bg-white p-3">
        <input
          type="checkbox"
          name="pinned"
          defaultChecked={announcement?.pinned ?? false}
          className="size-5 accent-[var(--brand-gold)]"
        />
        <span className="text-sm font-medium">Pin to the top</span>
      </label>

      <label className="flex min-h-12 items-start gap-3 rounded-xl border border-brand-ink/20 bg-white p-3">
        <input
          type="checkbox"
          name="notify"
          defaultChecked={announcement?.notify ?? false}
          disabled={alreadyNotified}
          className="mt-0.5 size-5 accent-[var(--brand-gold)] disabled:opacity-50"
        />
        <span>
          <span className="block text-sm font-medium">Send a notification</span>
          <span className="block text-xs text-brand-ink/60">
            {alreadyNotified
              ? "Already sent. Editing won't notify anyone again."
              : "Adds it to each recipient's bell. No email yet."}
          </span>
        </span>
      </label>

      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-12 flex-1 rounded-xl bg-brand-gold px-4 text-base font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link
          href="/manage/announcements"
          className="flex min-h-12 items-center rounded-xl border border-brand-ink/20 bg-white px-4 text-sm font-medium"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
