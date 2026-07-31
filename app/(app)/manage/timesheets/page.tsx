import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { EmployeeTimesheetCard, NewPayPeriodForm } from "@/components/TimesheetAdmin";
import { Card, Chip, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { SheetTrigger } from "@/components/ui/Sheet";
import { requireTab } from "@/lib/guard";
import { listPunchesBetween, listPayPeriods, listApprovals } from "@/lib/punches";
import { listAssignableProfiles, nameMap } from "@/lib/tasks";
import { formatBarnDayLabel } from "@/lib/dates";
import { pairPunches, totalMinutes, flagsForPunch } from "@/lib/timeclock";
import { barn } from "@/config/barn";
import { setPeriodStatus, suggestedPeriod } from "./actions";

export const metadata = { title: "Timesheets" };

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: barn.timezone,
});

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
    <TabPage title="Timesheets" back="/manage">
      {periods.length > 0 && (
        <nav aria-label="Pay period" className="flex flex-wrap gap-2">
          {periods.slice(0, 6).map((p) => (
            <Link
              key={p.id}
              href={`/manage/timesheets?period=${p.id}`}
              aria-current={p.id === period?.id ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-chip px-3 text-label font-semibold ${
                p.id === period?.id ? "bg-gold text-ink" : "border border-line bg-surface text-ink"
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
          emoji="🗓️"
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
              body="Once staff start clocking in against these dates, each person gets a card here with their total and anything worth checking."
              emoji="⏱️"
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
