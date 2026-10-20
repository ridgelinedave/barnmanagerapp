import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { TimeClock } from "@/components/TimeClock";
import { PunchList } from "@/components/PunchList";
import { Card, SectionHeader } from "@/components/ui/primitives";
import { requireTab } from "@/lib/guard";
import { loadClockState } from "@/lib/clock-state";
import { formatBarnDayLabel } from "@/lib/dates";
import { pairPunches, totalMinutes, formatMinutes } from "@/lib/timeclock";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Clock" };

export default async function ClockPage() {
  await requireTab("/clock");

  if (!featureEnabled("clockIn")) {
    return (
      <TabPage title="Clock">
        <StubScreen heading="Clock in and out" phase="Phase 1" />
      </TabPage>
    );
  }

  // The same cached read TimeClock uses, so the button and this history are
  // one query and can never disagree. The week runs Monday on, barn time.
  const { today, weekStart, weekPunches } = await loadClockState();
  const todaysPunches = weekPunches.filter((p) => p.punched_at.slice(0, 10) === today);
  const week = totalMinutes(pairPunches(weekPunches));

  return (
    <TabPage title="Clock">
      <TimeClock />

      <Card className="flex items-baseline gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-heading text-ink">This week</h2>
          <p className="mt-0.5 font-condensed text-label font-medium text-muted">Since {formatBarnDayLabel(weekStart)}</p>
        </div>
        <p className="font-condensed text-[2rem] font-semibold leading-none text-ink">{formatMinutes(week)}</p>
      </Card>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Today" />
        <PunchList
          punches={todaysPunches}
          emptyLabel="No punches today."
        />
      </section>
    </TabPage>
  );
}
