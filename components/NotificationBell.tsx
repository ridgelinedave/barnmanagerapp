"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { createClient } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/env";

/**
 * Bell icon with an unread badge, backed by the `notifications` table.
 *
 * Phase 0 ships the surface only — the feed is expected to be empty. RLS limits
 * the query to the caller's own notifications, so no filtering is done here.
 */
export function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!supabaseConfigured()) return;

    let cancelled = false;
    const supabase = createClient();

    const load = async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (!cancelled && !error) setUnread(count ?? 0);
    };

    void load();

    // Realtime badge. Silently inert until the table exists.
    const channel = supabase
      .channel("notifications-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        void load();
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  /*
   * The bell sits in the oxblood header, so it is white-on-deep (15.85:1); the
   * badge is gold carrying ink (7.92:1) rather than a red dot, because unread
   * mail is not an error — red in this system means something is wrong.
   *
   * Both were broken while the header was white: the icon kept `text-white/85`
   * from the charcoal era and disappeared into the bar, and the badge was
   * `bg-accent` under `text-ink` — dark on dark. Fixed with the header, not
   * around it.
   */
  return (
    <a
      href="/notifications"
      aria-label={label}
      className="relative -mr-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-white lg:size-9 lg:text-ink"
    >
      <Icon name="bell" className="size-6 lg:size-5" />
      {unread > 0 && (
        /* White carrying ink on the oxblood header (17:1), ink carrying white
           on the desktop's light page header. It was gold — gold is decorative
           only in this system, and a count is information. */
        <span className="absolute right-0.5 top-1 min-w-5 rounded-chip bg-white px-1 text-center font-sans text-micro leading-5 text-ink tabular-nums lg:-right-1 lg:top-0 lg:bg-ink lg:text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </a>
  );
}
