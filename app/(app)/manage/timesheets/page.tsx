import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { EmployeeTimesheetCard, NewPayPeriodForm } from "@/components/TimesheetAdmin";
import { Avatar } from "@/components/ui/ListRow";
import { Card, Chip, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { SheetTrigger } from "@/components/ui/Sheet";
import { requireTab } from "@/lib/guard";
import { listPunchesBetween, listPayPeriods, listApprovals } from "@/lib/punches";
import { listAssignableProfiles, nameMap } from "@/lib/tasks";
import { formatBarnDayLabel } from "@/lib/dates";
import {
  currentlyClockedIn,
  formatMinutes,
  pairPunches,
  totalMinutes,
  flagsForPunch,
} from "@/lib/timeclock";
import { barn } from "@/config/barn";
import { setPeriodStatus, suggestedPeriod } from "./actions";

export const metadata = { title: "Clock-ins & timesheets" };

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: barn.timezone,
});

const clockFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: barn.timezone,
});

/**
 * How far back to look for an open in-punch.
 *
 * Long enough to cover any real shift plus an overnight forgotten punch-out,
 * short enough that the query stays small. Someone who punched in more than
 * two days ago and never out will not show here — they will show on their
 * timesheet card below as an unclosed pair, which is where a correction gets
 * made anyway.
 */
const ON_CLOCK_LOOKBACK_HOURS = 48;

/**
 * Read the clock once, here rather than in the component body.
 *
 * The React compiler rightly refuses `Date.now()` inside a render: a value that
 * changes every call cannot be re-derived on a re-render and stay the same.
 * Reading it in a plain function is the same pattern the home greeting uses,
 * and this page renders once per request on the server.
 */
function onClockWindow(): { now: number; from: string; to: string } {
  const now = Date.now();
  return {
    now,
    from: new Date(now - ON_CLOCK_LOOKBACK_HOURS * 3_600_000).toISOString(),
    // A hair into the future, so a punch recorded a moment ago is not missed by
    // a clock that has already moved on.
    to: new Date(now + 60_000).toISOString(),
  };
}

/** Card stack: one card per employee for the selected pay period. */
export default async function ManageTimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireTab("/manage");

  const params = await searchParams;
  const [periods, people, suggestion] = await Promise.all([
    listPayPeriods(),
    listAssignableProfiles(),
    suggestedPeriod(),
  ]);

  const period = params.period
    ? periods.find((p) => p.id === params.period)
    : periods[0];

  const names = nameMap(people);

  /*
   * WHO IS ON THE CLOCK RIGHT NOW.
   *
   * The screen opened straight onto pay periods, which answers a fortnightly
   * question. The daily one — is anyone here, and how long have they been here
   * — had no surface at all, even though every punch needed to answer it was
   * already in the table.
   *
   * No new SQL: one read of the last two days, grouped by person, and the same
   * `currentlyClockedIn` the staff clock screen uses. RLS returns every
   * person's punches to an admin and only their own to staff, so this is the
   * admin view by policy rather than by a filter written here.
   */
  const { now, from, to } = onClockWindow();
  const recent = await listPunchesBetween(from, to);

  const recentByProfile = new Map<string, typeof recent>();
  for (const punch of recent) {
    const list = recentByProfile.get(punch.profile_id) ?? [];
    list.push(punch);
    recentByProfile.set(punch.profile_id, list);
  }

  const onClock = [...recentByProfile.entries()]
    .flatMap(([profileId, theirs]) => {
      const open = currentlyClockedIn(theirs);
      if (!open) return [];
      return [
        {
          profileId,
          name: names.get(profileId) ?? "Unnamed",
          since: open.punched_at,
          minutes: Math.max(0, Math.round((now - Date.parse(open.punched_at)) / 60_000)),
        },
      ];
    })
    .sort((a, b) => a.since.localeCompare(b.since));

  const punches = period
    ? await listPunchesBetween(`${period.start_date}T00:00:00Z`, `${period.end_date}T23:59:59Z`)
    : [];
  const approvals = period ? await listApprovals(period.id) : [];
  const approvedByProfile = new Map(approvals.map((a) => [a.profile_id, a.total_minutes]));

  const byProfile = new Map<string, typeof punches>();
  for (const punch of punches) {
    const list = byProfile.get(punch.profile_id) ?? [];
    list.push(punch);
    byProfile.set(punch.profile_id, list);
  }

  // Only staff appear — an admin who never punches shouldn't clutter payroll.
  const employees = people.filter((p) => p.role === "staff" || byProfile.has(p.id));

  return (
    <TabPage title="Clock-ins" back="/manage">
      {/* The daily question, above the fortnightly one. */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="On the clock now"
          count={onClock.length === 1 ? "1 person" : `${onClock.length} people`}
        />

        {onClock.length === 0 ? (
          <EmptyState
            title="Nobody is on the clock"
            body="Anyone who punches in from the Clock tab appears here until they punch out."
          />
        ) : (
          <Card className="flex flex-col gap-3 p-4">
            {onClock.map((person) => (
              <div key={person.profileId} className="flex items-center gap-3">
                <Avatar name={person.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-heading leading-snug text-ink">{person.name}</p>
                  <p className="mt-0.5 text-caption text-muted">
                    In at {clockFormatter.format(new Date(person.since))}
                  </p>
                </div>
                <Chip value={formatMinutes(person.minutes)} icon="clock" tone="forest" />
              </div>
            ))}
          </Card>
        )}
      </section>

      <SectionHeader title="Hours & approvals" />

      {periods.length > 0 && (
        <nav aria-label="Pay period" className="flex flex-wrap gap-2">
          {periods.slice(0, 6).map((p) => (
            <Link
              key={p.id}
              href={`/manage/timesheets?period=${p.id}`}
              aria-current={p.id === period?.id ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-chip px-3 text-label font-semibold ${
                p.id === period?.id ? "bg-accent text-accent-on" : "border border-line bg-surface text-ink"
              }`}
            >
              {formatBarnDayLabel(p.start_date)}
            </Link>
          ))}
        </nav>
      )}

      {!period ? (
        <EmptyState
          title="No pay periods yet"
          body="Open one below and the week's punches get grouped under it, ready to check and approve."
        />
      ) : (
        <>
          <Card className="p-4">
            <h2 className="font-display text-heading text-ink">
              {formatBarnDayLabel(period.start_date)} – {formatBarnDayLabel(period.end_date)}
            </h2>
            <div className="mt-1.5">
              <Chip
                value={period.status}
                icon={period.status === "open" ? "clock" : "check"}
                tone={period.status === "open" ? "gold" : "forest"}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={`/manage/timesheets/export?period=${period.id}`}
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-control border border-line bg-surface px-4 text-label font-semibold text-ink"
              >
                Export CSV
              </a>
              <form action={setPeriodStatus}>
                <input type="hidden" name="id" value={period.id} />
                <input
                  type="hidden"
                  name="status"
                  value={period.status === "open" ? "approved" : "open"}
                />
                <Button type="submit" variant="secondary">
                  {period.status === "open" ? "Close period" : "Reopen"}
                </Button>
              </form>
            </div>

            <p className="mt-2 text-caption text-muted">
              CSV export stands in for QuickBooks while the API sync is deferred. Confirm the
              column layout against the barn&apos;s QuickBooks before relying on a straight import.
            </p>
          </Card>

          {employees.length === 0 ? (
            <EmptyState
              title="No punches in this period"
              body="Each person’s hours appear once they clock in."
            />
          ) : (
            employees.map((person) => {
              const theirs = byProfile.get(person.id) ?? [];
              const pairs = pairPunches(theirs);
              const minutes = totalMinutes(pairs);
              const flagged =
                theirs.filter((p) => p.source === "self" && flagsForPunch(p).length > 0).length +
                pairs.filter((p) => p.unclosed).length;

              return (
                <EmployeeTimesheetCard
                  key={person.id}
                  periodId={period.id}
                  profileId={person.id}
                  name={names.get(person.id) ?? "Unnamed"}
                  minutes={minutes}
                  flaggedCount={flagged}
                  approvedMinutes={approvedByProfile.get(person.id) ?? null}
                  correctable={theirs
                    .slice()
                    .reverse()
                    .map((punch) => ({
                      id: punch.id,
                      label: `${punch.direction === "in" ? "In" : "Out"} · ${timeFormatter.format(
                        new Date(punch.punched_at),
                      )}`,
                    }))}
                />
              );
            })
          )}
        </>
      )}

      <SheetTrigger label="Open a pay period" title="New pay period">
        <NewPayPeriodForm start={suggestion.start} end={suggestion.end} />
      </SheetTrigger>
    </TabPage>
  );
}
