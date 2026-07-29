import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  renderCalendar,
  scopeEvents,
  scopeLessons,
  type CalendarEvent,
  type FeedViewer,
} from "@/lib/ical";
import { barnLocalToUtc } from "@/lib/dates";
import { barn, featureEnabled } from "@/config/barn";

/**
 * The calendar subscription feed: /api/ical/<token>.ics
 *
 * ⚠ THIS ROUTE RUNS WITHOUT A SESSION AND WITH THE SERVICE ROLE, so RLS is NOT
 * protecting anything here. It has to be that way — Google Calendar cannot log
 * in, it just fetches a URL — which means the scoping below IS the security
 * boundary, and every query has to re-state the rule its policy would have
 * applied:
 *
 *   the token identifies exactly one profile          (unique, unguessable)
 *   a parent gets their own family's riders' lessons  (mirrors lesson_riders)
 *   a parent gets visibility='all' events only        (mirrors events)
 *   staff and admin get every lesson and every event  (mirrors both)
 *
 * If you add a table to this feed, add its rule here too — there is no policy
 * underneath to catch a mistake.
 *
 * An unknown token gets 404, deliberately the same answer as a malformed one:
 * the response must not help anyone tell "wrong token" from "no such feed".
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  if (!featureEnabled("events")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { token: raw } = await context.params;
  // The URL carries the .ics suffix so calendar clients recognise the file.
  const token = raw.replace(/\.ics$/i, "");

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = createAdminClient();

  const { data: tokenRow } = await supabase
    .from("ical_tokens")
    .select("profile_id")
    .eq("token", token)
    .maybeSingle();

  if (!tokenRow) return new NextResponse("Not found", { status: 404 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, family_id, full_name")
    .eq("id", tokenRow.profile_id)
    .maybeSingle();

  if (!profile) return new NextResponse("Not found", { status: 404 });

  const isBarn = profile.role === "admin" || profile.role === "staff";
  const viewer: FeedViewer = {
    isBarn,
    familyId: (profile.family_id as string | null) ?? null,
  };
  const events: CalendarEvent[] = [];
  const now = new Date();

  // --- barn events ----------------------------------------------------------
  // A family sees only what is marked visible to everyone. This is the line
  // that keeps a staff-only vet visit off a family's phone — applied twice, at
  // the query and again in scopeEvents(), because it is the kind of line that
  // must not depend on one expression being right.
  let eventQuery = supabase
    .from("events")
    .select("id, type, title, description, start_at, end_at, location, visibility");
  if (!isBarn) eventQuery = eventQuery.eq("visibility", "all");

  const { data: barnEvents } = await eventQuery;

  for (const event of scopeEvents(viewer, barnEvents ?? [])) {
    events.push({
      uid: `event-${event.id}@crouse-barn-app`,
      start: new Date(event.start_at as string),
      end: event.end_at ? new Date(event.end_at as string) : null,
      summary: event.title as string,
      description: (event.description as string) || undefined,
      location: (event.location as string) || undefined,
    });
  }

  // --- lessons --------------------------------------------------------------
  if (featureEnabled("lessons")) {
    const { data: instances } = await supabase
      .from("lesson_instances")
      .select("id, date, start_time, duration_min, type, status")
      .eq("status", "scheduled");

    // Mirrors the lesson_riders policy: this family's riders, actually booked.
    let riderIds: string[] = [];
    let seats: { instance_id: string; rider_id: string }[] = [];

    if (!isBarn && viewer.familyId) {
      const { data: riders } = await supabase
        .from("riders")
        .select("id")
        .eq("family_id", viewer.familyId);

      riderIds = (riders ?? []).map((r) => r.id as string);

      if (riderIds.length > 0) {
        const { data: rows } = await supabase
          .from("lesson_riders")
          .select("instance_id, rider_id, status")
          .in("rider_id", riderIds)
          .in("status", ["booked", "backfilled"]);

        seats = (rows ?? []).map((row) => ({
          instance_id: row.instance_id as string,
          rider_id: row.rider_id as string,
        }));
      }
    }

    const relevant = scopeLessons(viewer, instances ?? [], seats, riderIds);

    for (const instance of relevant) {
      // Lessons are stored as a barn-local date and wall-clock time; a calendar
      // needs an absolute instant.
      const start = barnLocalToUtc(instance.date as string, instance.start_time as string);
      const end = new Date(start.getTime() + Number(instance.duration_min ?? 60) * 60 * 1000);

      events.push({
        uid: `lesson-${instance.id}@crouse-barn-app`,
        start,
        end,
        summary: isBarn
          ? `${instance.type === "group" ? "Group" : "Private"} lesson`
          : "Riding lesson",
        location: barn.name,
      });
    }
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());

  const body = renderCalendar(`${barn.shortName} — ${profile.full_name ?? "Calendar"}`, events, now);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${barn.id}.ics"`,
      // The URL is a credential. Keep it out of shared caches, and out of
      // search engines if it is ever pasted somewhere public.
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
