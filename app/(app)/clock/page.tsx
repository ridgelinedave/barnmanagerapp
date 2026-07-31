import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { ClockButton } from "@/components/ClockButton";
import { PunchList } from "@/components/PunchList";
import { Card, SectionHeader } from "@/components/ui/primitives";
import { requireTab } from "@/lib/guard";
import { listPunchesBetween } from "@/lib/punches";
import { addBarnDays, barnToday, formatBarnDayLabel } from "@/lib/dates";
import { currentlyClockedIn, pairPunches, totalMinutes, formatMinutes } from "@/lib/timeclock";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Clock" };

export default async function ClockPage() {
  await requireTab("/clock");

  if (!featureEnabled("clockIn")) {
    return (
      <TabPage title="Clock">
        <StubScreen
          heading="Clock in and out"
          phase="Phase 1"
          detail="The in/out button, today's punches and your week total."
        />
      </TabPage>
    );
  }

  const today = barnToday();
  // Monday of the current barn week, so the total matches how shifts are talked about.
  const isoDow = ((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const weekStart = addBarnDays(today, -(isoDow - 1));

  // RLS returns only this staff member's own punches.
  const weekPunches = await listPunchesBetween(`${weekStart}T00:00:00Z`, `${today}T23:59:59Z`);
  const todaysPunches = weekPunches.filter((p) => p.punched_at.slice(0, 10) === today);

  const openPunch = currentlyClockedIn(weekPunches);
  const week = totalMinutes(pairPunches(weekPunches));

  return (
    <TabPage title="Clock">
      <ClockButton clockedIn={Boolean(openPunch)} />

      <Card className="flex items-baseline gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-heading text-ink">This week</h2>
          <p className="mt-0.5 text-caption text-muted">Since {formatBarnDayLabel(weekStart)}</p>
        </div>
        <p className="font-display text-display leading-none text-ink">{formatMinutes(week)}</p>
      </Card>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Today" />
        <PunchList
          punches={todaysPunches}
          emptyLabel="Nothing yet today — tap the button above when you start."
        />
      </section>
    </TabPage>
  );
}
