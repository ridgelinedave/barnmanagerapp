"use client";

import { useEffect, useState } from "react";
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

  return (
    <a
      href="/notifications"
      aria-label={label}
      className="relative inline-flex size-11 items-center justify-center rounded-full text-brand-ink"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-6"
      >
        <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z" />
        <path d="M10.5 20a2 2 0 0 0 3 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute right-1.5 top-1.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs font-semibold leading-5 text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </a>
  );
}
