import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { PunchList } from "@/components/PunchList";
import { currentRole } from "@/lib/guard";
import { redirect } from "next/navigation";
import { listPunchesBetween, listApprovals, listPayPeriods } from "@/lib/punches";
import { addBarnDays, barnToday, formatBarnDayLabel } from "@/lib/dates";
import { pairPunches, totalMinutes, formatMinutes } from "@/lib/timeclock";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "My timesheet" };

/** Staff-facing history: the last four weeks, plus whatever has been approved. */
export default async function TimesheetPage() {
  const role = await currentRole();
  if (!featureEnabled("clockIn") || role === "parent") redirect("/more");

  const today = barnToday();
  const from = addBarnDays(today, -28);

  // RLS scopes both of these: own punches, own approvals.
  const [punches, approvals, periods] = await Promise.all([
    listPunchesBetween(`${from}T00:00:00Z`, `${today}T23:59:59Z`),
    listApprovals(),
    listPayPeriods(),
  ]);

  const periodById = new Map(periods.map((p) => [p.id, p]));

  // Group by barn-local day, newest first.
  const byDay = new Map<string, typeof punches>();
  for (const punch of punches) {
    const day = punch.punched_at.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(punch);
    byDay.set(day, list);
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <TabPage title="My timesheet">
      {approvals.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Approved</h2>
          {approvals.map((approval) => {
            const period = periodById.get(approval.period_id);
            return (
              <div
                key={approval.id}
                className="flex items-baseline gap-2 rounded-2xl border border-brand-ink/10 bg-white p-4"
              >
                <span className="flex-1 text-sm">
                  {period
                    ? `${formatBarnDayLabel(period.start_date)} – ${formatBarnDayLabel(period.end_date)}`
                    : "Pay period"}
                </span>
                <span className="text-base font-semibold tabular-nums">
                  {formatMinutes(approval.total_minutes)}
                </span>
              </div>
            );
          })}
        </section>
      )}

      <h2 className="text-base font-semibold">Last 4 weeks</h2>

      {days.length === 0 ? (
        <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
          No punches recorded yet.
        </p>
      ) : (
        days.map(([day, dayPunches]) => {
          const minutes = totalMinutes(pairPunches(dayPunches));
          return (
            <section key={day} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-brand-ink/70">
                  {formatBarnDayLabel(day)}
                </h3>
                <span className="text-sm font-semibold tabular-nums">
                  {formatMinutes(minutes)}
                </span>
              </div>
              <PunchList punches={dayPunches} />
            </section>
          );
        })
      )}

      <Link href="/more" className="py-2 text-center text-sm font-medium underline">
        Back to More
      </Link>
    </TabPage>
  );
}
