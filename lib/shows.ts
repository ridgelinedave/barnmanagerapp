import "server-only";

import { createClient } from "@/lib/supabase/server";
import { currentRole } from "@/lib/guard";
import { supabaseConfigured } from "@/lib/env";
import { barnToday } from "@/lib/dates";
import { barn } from "@/config/barn";
import type { Show, ShowEntry, ShowResult } from "@/lib/types";

/**
 * The shows hub — reads only, all of them on the RLS-scoped client.
 *
 * WHO SEES WHAT IS NOT DECIDED HERE. A parent gets shows marked visible to
 * everyone and entries/results belonging to their own riders; staff and admin
 * get everything. That falls out of migration 0021's policies, and
 * re-implementing any of it in this file would give the rule a second home and
 * a chance to drift — the same discipline lib/calendar.ts follows.
 *
 * The one thing this file DOES decide is presentation: which sub-tab a show
 * lands under, and how a date range reads.
 */

/** A show with its roster and results already attached. */
export type ShowDetail = {
  show: Show;
  entries: (ShowEntry & { riderName: string; horseName: string | null })[];
  results: (ShowResult & { riderName: string })[];
};

/** A card in the carousel / a row in the next-up list. */
export type ShowSummary = {
  show: Show;
  /** Entries the CALLER can see — for a parent that is only their own riders. */
  riderCount: number;
  /** True when the caller has a rider entered. Drives "My rides" vs "Register". */
  mine: boolean;
  rideTimesPosted: boolean;
  /** Drives the Results sub-tab. See splitShows for why it is not "is it past". */
  hasResults: boolean;
  dateLabel: string;
};

/**
 * "Aug 22 – 24" when a show sits inside one month, "Aug 30 – Sep 1" when it
 * straddles two. Printing the month twice for a three-day show is noise on a
 * 250px card.
 */
export function showDateLabel(startDate: string, endDate: string): string {
  // Parsed at UTC noon so no timezone can shift the calendar day — the same
  // guard lib/month.ts uses. A show date is a calendar fact, not an instant.
  const at = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: barn.timezone, ...opts }).format(
      new Date(`${iso}T12:00:00Z`),
    );

  const start = at(startDate, { month: "short", day: "numeric" });
  if (startDate === endDate) return start;

  const sameMonth = startDate.slice(0, 7) === endDate.slice(0, 7);
  const end = sameMonth
    ? at(endDate, { day: "numeric" })
    : at(endDate, { month: "short", day: "numeric" });

  return `${start} – ${end}`;
}

/**
 * Everything the hub screen needs, in three reads.
 *
 * Three round trips rather than one nested select because the join is trivial
 * in memory and a nested PostgREST select against three RLS-policed tables is
 * far harder to reason about when a row goes missing — you cannot tell which
 * policy dropped it.
 */
export async function listShows(): Promise<ShowSummary[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await createClient();

  const [role, { data: shows }] = await Promise.all([
    currentRole(),
    supabase.from("shows").select("*").order("start_date", { ascending: true }),
  ]);

  if (!shows?.length) return [];

  const ids = shows.map((s) => s.id);
  const [{ data: entries }, { data: scored }] = await Promise.all([
    supabase.from("show_entries").select("show_id, rider_id, ride_time").in("show_id", ids),
    supabase.from("show_results").select("show_id").in("show_id", ids),
  ]);

  const withResults = new Set((scored ?? []).map((r) => r.show_id));

  // Distinct riders per show. A rider entered on two horses is one rider going.
  const riders = new Map<string, Set<string>>();
  const timed = new Set<string>();
  for (const entry of entries ?? []) {
    if (!riders.has(entry.show_id)) riders.set(entry.show_id, new Set());
    riders.get(entry.show_id)!.add(entry.rider_id);
    if (entry.ride_time) timed.add(entry.show_id);
  }

  return (shows as Show[]).map((show) => {
    const seen = riders.get(show.id);
    return {
      show,
      riderCount: seen?.size ?? 0,
      // On the RLS-scoped client a parent can ONLY see their own riders'
      // entries, so "any entry visible to me" IS "mine" — but ONLY for a
      // parent. The role test is the whole point: without it an admin, who
      // sees every entry, gets "My rides" on every show in the barn.
      mine: role === "parent" && (seen?.size ?? 0) > 0,
      rideTimesPosted: timed.has(show.id),
      hasResults: withResults.has(show.id),
      dateLabel: showDateLabel(show.start_date, show.end_date),
    };
  });
}

/**
 * Sub-tab routing.
 *
 * RESULTS IS "HAS RESULTS", NOT "IS IN THE PAST". The obvious rule — end_date
 * older than today — gets both ends wrong: a show ridden yesterday sits under
 * Results with nothing in it until someone types the placings in, and a show
 * whose scores are already posted mid-week is filed under Upcoming where
 * nobody looks for them. People open this tab to find placings, so it lists
 * the shows that have placings.
 */
export function splitShows(all: ShowSummary[], today = barnToday()) {
  return {
    upcoming: all.filter((s) => s.show.end_date >= today),
    // Most recent first: a results list is read newest-down.
    results: all.filter((s) => s.hasResults).reverse(),
    pinned: all.filter((s) => s.show.pinned),
  };
}

/** One show, with its roster and results. Returns null when RLS hides it. */
export async function loadShow(id: string): Promise<ShowDetail | null> {
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();

  const { data: show } = await supabase.from("shows").select("*").eq("id", id).maybeSingle();
  if (!show) return null;

  const [{ data: entries }, { data: results }] = await Promise.all([
    supabase
      .from("show_entries")
      .select("*")
      .eq("show_id", id)
      .order("ride_time", { ascending: true, nullsFirst: false }),
    supabase.from("show_results").select("*").eq("show_id", id),
  ]);

  // Names come from a second read rather than a nested select, for the reason
  // in the header: a nested select that returns null tells you nothing about
  // WHY.
  const riderIds = [
    ...new Set([
      ...(entries ?? []).map((e) => e.rider_id),
      ...(results ?? []).map((r) => r.rider_id),
    ]),
  ];
  const horseIds = [...new Set((entries ?? []).map((e) => e.horse_id).filter(Boolean))];

  const [{ data: riders }, { data: horses }] = await Promise.all([
    riderIds.length
      ? supabase.from("riders").select("id, name").in("id", riderIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    horseIds.length
      ? supabase.from("horses").select("id, name").in("id", horseIds as string[])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const riderName = new Map((riders ?? []).map((r) => [r.id, r.name]));
  const horseName = new Map((horses ?? []).map((h) => [h.id, h.name]));

  return {
    show: show as Show,
    entries: (entries ?? []).map((e) => ({
      ...(e as ShowEntry),
      riderName: riderName.get(e.rider_id) ?? "Rider",
      horseName: e.horse_id ? (horseName.get(e.horse_id) ?? null) : null,
    })),
    results: (results ?? [])
      .map((r) => ({ ...(r as ShowResult), riderName: riderName.get(r.rider_id) ?? "Rider" }))
      // Placings first and in order; the unplaced fall to the bottom rather
      // than sorting as if they had won.
      .sort((a, b) => (a.placing ?? 9999) - (b.placing ?? 9999)),
  };
}

/** "1st", "2nd", "3rd" … The sport writes placings this way, not "Place: 2". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}
