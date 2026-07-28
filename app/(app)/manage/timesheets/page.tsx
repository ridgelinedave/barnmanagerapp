import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { EmployeeTimesheetCard, NewPayPeriodForm } from "@/components/TimesheetAdmin";
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
    <TabPage title="Timesheets">
      {periods.length > 0 && (
        <nav aria-label="Pay period" className="flex flex-wrap gap-2">
          {periods.slice(0, 6).map((p) => (
            <Link
              key={p.id}
              href={`/manage/timesheets?period=${p.id}`}
              aria-current={p.id === period?.id ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold ${
                p.id === period?.id
                  ? "bg-brand-gold text-brand-ink"
                  : "border border-brand-ink/20 bg-white"
              }`}
            >
              {formatBarnDayLabel(p.start_date)}
            </Link>
          ))}
        </nav>
      )}

      {!period ? (
        <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
          No pay periods yet. Open one below to start reviewing hours.
        </p>
      ) : (
        <>
          <section className="rounded-2xl border border-brand-ink/10 bg-white p-4">
            <h2 className="text-base font-semibold">
              {formatBarnDayLabel(period.start_date)} – {formatBarnDayLabel(period.end_date)}
            </h2>
            <p className="mt-0.5 text-sm capitalize text-brand-ink/60">{period.status}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={`/manage/timesheets/export?period=${period.id}`}
                className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-brand-ink/20 px-3 text-sm font-semibold"
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
                <button
                  type="submit"
                  className="min-h-11 rounded-xl border border-brand-ink/20 bg-white px-3 text-sm font-semibold"
                >
                  {period.status === "open" ? "Close period" : "Reopen"}
                </button>
              </form>
            </div>

            <p className="mt-2 text-xs text-brand-ink/55">
              CSV export stands in for QuickBooks while the API sync is deferred. Confirm the
              column layout against the barn&apos;s QuickBooks before relying on a straight import.
            </p>
          </section>

          {employees.length === 0 ? (
            <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
              No staff punches in this period.
            </p>
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

      <section className="flex flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4">
        <h2 className="text-base font-semibold">Open a pay period</h2>
        <NewPayPeriodForm start={suggestion.start} end={suggestion.end} />
      </section>

      <Link href="/manage" className="py-2 text-center text-sm font-medium underline">
        Back to Manage
      </Link>
    </TabPage>
  );
}
