import { TabPage } from "@/components/TabPage";
import { PunchList } from "@/components/PunchList";
import { Card, EmptyState, SectionHeader } from "@/components/ui/primitives";
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
    <TabPage title="My timesheet" back="/more">
      {approvals.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeader title="Approved" />
          {approvals.map((approval) => {
            const period = periodById.get(approval.period_id);
            return (
              <Card key={approval.id} className="flex items-baseline gap-3 p-4">
                <span className="min-w-0 flex-1 text-caption text-ink">
                  {period
                    ? `${formatBarnDayLabel(period.start_date)} – ${formatBarnDayLabel(period.end_date)}`
                    : "Pay period"}
                </span>
                <span className="font-display text-heading text-ink">
                  {formatMinutes(approval.total_minutes)}
                </span>
              </Card>
            );
          })}
        </section>
      )}

      <SectionHeader title="Last 4 weeks" />

      {days.length === 0 ? (
        <EmptyState
          title="No hours yet"
          body="Your hours, day by day."
        />
      ) : (
        days.map(([day, dayPunches]) => {
          const minutes = totalMinutes(pairPunches(dayPunches));
          return (
            <section key={day} className="flex flex-col gap-2">
              <SectionHeader title={formatBarnDayLabel(day)} count={formatMinutes(minutes)} />
              <PunchList punches={dayPunches} />
            </section>
          );
        })
      )}
    </TabPage>
  );
}
