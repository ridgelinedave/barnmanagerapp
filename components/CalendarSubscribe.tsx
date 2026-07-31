"use client";

import { useState } from "react";
import { Sunk } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";

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
        <Button type="button" onClick={() => setRevealed(true)} variant="secondary" block>
          Show my calendar link
        </Button>
        <p className="text-caption text-muted">
          Anyone with this link can see your schedule without signing in, so treat it like a
          password.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* break-all, not truncate: a token you cannot read is a token you
          cannot check against the one in your calendar app. */}
      <Sunk>
        <p className="break-all text-caption">{url}</p>
      </Sunk>

      <Button type="button" onClick={copy} variant="primary" block>
        {copied ? "Copied" : "Copy link"}
      </Button>

      <p className="text-caption text-muted">
        In Google Calendar choose &ldquo;Other calendars → From URL&rdquo;. On iPhone, Settings →
        Calendar → Accounts → Add Account → Other → Add Subscribed Calendar.
      </p>
    </div>
  );
}
