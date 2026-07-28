import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { listPunchesBetween } from "@/lib/punches";
import { listAssignableProfiles, nameMap } from "@/lib/tasks";
import { pairPunches, decimalHours } from "@/lib/timeclock";
import { formatBarnDate } from "@/lib/dates";
import { barn } from "@/config/barn";
import type { PayPeriod } from "@/lib/types";

/**
 * CSV export of an approved pay period — the interim stand-in for the
 * QuickBooks Online API.
 *
 * One row per employee per day, which is the shape a QBO TimeActivity import
 * expects: QBO records duration against a person and a date, not against
 * individual punches.
 *
 * DEFERRED / NEEDS CONFIRMATION: the exact column set QuickBooks wants varies
 * by account configuration, and Belle's QBO has not been inspected. These
 * headers are the common TimeActivity import shape and must be checked against
 * her account before anyone relies on a straight import. The real fix is the
 * API sync, which writes TimeActivity directly and stores the returned ids in
 * timesheet_approvals.external_ref for idempotent re-syncs — that seam exists,
 * nothing fills it yet.
 */
function csvCell(value: string): string {
  // Quote anything that could break a row, and double embedded quotes.
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export async function GET(request: NextRequest) {
  const state = await getViewer();
  if (state.status !== "viewer" || state.viewer.role !== "admin") {
    return new NextResponse("Not found", { status: 404 });
  }

  const periodId = request.nextUrl.searchParams.get("period");
  if (!periodId) return new NextResponse("Missing period", { status: 400 });

  const supabase = await createClient();
  const { data: period } = await supabase
    .from("pay_periods")
    .select("*")
    .eq("id", periodId)
    .maybeSingle<PayPeriod>();

  if (!period) return new NextResponse("Not found", { status: 404 });

  const punches = await listPunchesBetween(
    `${period.start_date}T00:00:00Z`,
    `${period.end_date}T23:59:59Z`,
  );
  const people = await listAssignableProfiles();
  const names = nameMap(people);

  // Group punches per person, pair them, then roll the paired intervals up to
  // one line per person per barn-local day.
  const byProfile = new Map<string, typeof punches>();
  for (const punch of punches) {
    const list = byProfile.get(punch.profile_id) ?? [];
    list.push(punch);
    byProfile.set(punch.profile_id, list);
  }

  const rows: string[][] = [];
  for (const [profileId, theirs] of byProfile) {
    const perDay = new Map<string, number>();
    for (const pair of pairPunches(theirs)) {
      if (pair.unclosed || pair.minutes === 0) continue;
      const day = formatBarnDate(new Date(pair.in.punched_at));
      perDay.set(day, (perDay.get(day) ?? 0) + pair.minutes);
    }
    for (const [day, minutes] of [...perDay].sort()) {
      rows.push([
        names.get(profileId) ?? "Unknown",
        day,
        decimalHours(minutes),
        `${barn.name} — ${period.start_date} to ${period.end_date}`,
      ]);
    }
  }

  rows.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));

  const header = ["Employee", "Date", "Hours", "Description"];
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");

  const filename = `${barn.id}-timesheet-${period.start_date}-to-${period.end_date}.csv`;

  return new NextResponse(`${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // A payroll export must never be served from a cache.
      "Cache-Control": "no-store",
    },
  });
}
