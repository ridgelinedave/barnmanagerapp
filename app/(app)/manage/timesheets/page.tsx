import { TabPage } from "@/components/TabPage";
import {
  EmployeeTimesheetCard,
  NewPayPeriodForm,
  TimesheetRowActions,
} from "@/components/TimesheetAdmin";
import {
  DESKTOP_ONLY,
  DataTable,
  MOBILE_ONLY,
  parseSort,
  sortHrefFor,
  sortRows,
  type Row,
} from "@/components/ui/DataTable";
import { SubTabs } from "@/components/ui/SubTabs";
import { Avatar, ROW, ROW_META, ROW_TITLE, RowList } from "@/components/ui/ListRow";
import { Card, Chip, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { Button, buttonClass } from "@/components/ui/Button";
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

export const metadata = { title: "Clock-ins and timesheets" };

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
  searchParams: Promise<{ period?: string; sort?: string; dir?: string }>;
}) {
  await requireTab("/manage");

  const params = await searchParams;
  const sortState = parseSort(params, ["name", "hours", "approved", "flags"], {
    key: "name",
    dir: "asc",
  });
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

  // One computation per person, shared by the phone cards and the desktop table.
  const sheets = employees.map((person) => {
    const theirs = byProfile.get(person.id) ?? [];
    const pairs = pairPunches(theirs);
    return {
      id: person.id,
      name: names.get(person.id) ?? "Unnamed",
      minutes: totalMinutes(pairs),
      flagged:
        theirs.filter((p) => p.source === "self" && flagsForPunch(p).length > 0).length +
        pairs.filter((p) => p.unclosed).length,
      approved: approvedByProfile.get(person.id) ?? null,
      correctable: theirs
        .slice()
        .reverse()
        .map((punch) => ({
          id: punch.id,
          label: `${punch.direction === "in" ? "In" : "Out"} · ${timeFormatter.format(
            new Date(punch.punched_at),
          )}`,
        })),
    };
  });

  const tableRows: Row[] = period
    ? sheets.map((s) => ({
        key: s.id,
        sort: { name: s.name, hours: s.minutes, approved: s.approved, flags: s.flagged },
        cells: {
          name: s.name,
          hours: formatMinutes(s.minutes),
          approved: s.approved === null ? "—" : formatMinutes(s.approved),
          flags: s.flagged > 0 ? <Chip value={`${s.flagged} to check`} icon="alert" tone="gold" /> : "—",
          actions: (
            <TimesheetRowActions
              periodId={period.id}
              profileId={s.id}
              name={s.name}
              minutes={s.minutes}
              approvedMinutes={s.approved}
              correctable={s.correctable}
            />
          ),
        },
      }))
    : [];

  const periodTabs =
    periods.length > 0 ? (
      <SubTabs
        label="Pay period"
        items={periods.slice(0, 6).map((p) => ({
          href: `/manage/timesheets?period=${p.id}`,
          label: formatBarnDayLabel(p.start_date),
          current: p.id === period?.id,
        }))}
      />
    ) : null;

  return (
    <TabPage density="tight"
      title="Clock-ins and timesheets"
      back="/barn"
      layout="wide"
      action={
        // Desktop: the primary action sits right in the page header. On a
        // phone that would crush the title at 320px, so it stays at the foot
        // of the screen, below.
        <div className="hidden lg:block">
          <SheetTrigger label="New pay period" title="New pay period" variant="primary">
            <NewPayPeriodForm start={suggestion.start} end={suggestion.end} />
          </SheetTrigger>
        </div>
      }
    >
      {/* The daily question, above the fortnightly one. */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="On the clock"
          count={onClock.length === 1 ? "1 person" : `${onClock.length} people`}
        />

        {onClock.length === 0 ? (
          <EmptyState title="Nobody clocked in" />
        ) : (
          <RowList>
            {onClock.map((person) => (
              <div key={person.profileId} className={ROW}>
                <Avatar name={person.name} />
                <div className="min-w-0 flex-1">
                  <p className={`${ROW_TITLE} text-ink`}>{person.name}</p>
                  <p className={ROW_META}>
                    In at {clockFormatter.format(new Date(person.since))}
                  </p>
                </div>
                <Chip value={formatMinutes(person.minutes)} icon="clock" tone="forest" />
              </div>
            ))}
          </RowList>
        )}
      </section>

      <SectionHeader title="Hours and approvals" />

      {periodTabs}

      {!period ? (
        <EmptyState title="No pay periods yet" />
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
                className={buttonClass("secondary")}
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
              Check the columns against QuickBooks before importing.
            </p>
          </Card>

          {sheets.length === 0 ? (
            <EmptyState title="No punches in this period" />
          ) : (
            <>
              <div className={`flex flex-col gap-3 ${MOBILE_ONLY}`}>
                {sheets.map((s) => (
                  <EmployeeTimesheetCard
                    key={s.id}
                    periodId={period.id}
                    profileId={s.id}
                    name={s.name}
                    minutes={s.minutes}
                    flaggedCount={s.flagged}
                    approvedMinutes={s.approved}
                    correctable={s.correctable}
                  />
                ))}
              </div>
              <div className={DESKTOP_ONLY}>
                <DataTable
                  caption="Hours by person for this pay period"
                  columns={[
                    { key: "name", label: "Employee", sortable: true },
                    { key: "hours", label: "Hours", numeric: true, sortable: true },
                    { key: "approved", label: "Approved", numeric: true, sortable: true },
                    { key: "flags", label: "To check", sortable: true },
                    { key: "actions", label: "Actions", hideLabel: true, className: "w-px whitespace-nowrap" },
                  ]}
                  rows={sortRows(tableRows, sortState.key, sortState.dir)}
                  sort={{ ...sortState, href: sortHrefFor("/manage/timesheets", params) }}
                />
              </div>
            </>
          )}
        </>
      )}

      <div className={MOBILE_ONLY}>
        <SheetTrigger label="New pay period" title="New pay period">
          <NewPayPeriodForm start={suggestion.start} end={suggestion.end} />
        </SheetTrigger>
      </div>
    </TabPage>
  );
}
