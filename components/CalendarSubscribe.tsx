"use client";

import { useState } from "react";

/**
 * The calendar subscription URL.
 *
 * Deliberately NOT shown by default. This URL is a bearer credential: anyone
 * who has it can read the schedule with no login, forever, until it is rotated.
 * Printing it on the More screen means it is on display any time someone hands
 * their phone over — so it stays behind a tap, with the consequence spelled out.
 *
 * Copying uses the async clipboard API where it exists and falls back to
 * selecting the text, because on iOS Safari the API is unavailable outside a
 * user gesture in some versions and a silently-failing copy button is worse
 * than a visible box of text.
 */
export function CalendarSubscribe({ url }: { url: string }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setRevealed(true);
    }
  }

  if (!revealed) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-4 text-base font-semibold"
        >
          Show my calendar link
        </button>
        <p className="text-xs text-brand-ink/55">
          Anyone with this link can see your schedule without signing in, so treat it like a
          password.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="break-all rounded-xl border border-brand-ink/15 bg-brand-ink/5 p-3 text-xs">
        {url}
      </p>

      <button
        type="button"
        onClick={copy}
        className="min-h-12 rounded-xl bg-brand-gold px-4 text-base font-semibold text-brand-ink"
      >
        {copied ? "Copied" : "Copy link"}
      </button>

      <p className="text-xs text-brand-ink/55">
        In Google Calendar choose &ldquo;Other calendars → From URL&rdquo;. On iPhone, Settings →
        Calendar → Accounts → Add Account → Other → Add Subscribed Calendar.
      </p>
    </div>
  );
}
