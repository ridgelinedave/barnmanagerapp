import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { ClockButton } from "@/components/ClockButton";
import { PunchList } from "@/components/PunchList";
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
        <StubScreen heading="Clock in and out" phase="Phase 1">
          <p className="text-sm text-brand-ink/70">
            The in/out button, GPS capture, today&apos;s punches, and your week total land here.
          </p>
        </StubScreen>
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

      <section className="rounded-2xl border border-brand-ink/10 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">This week</h2>
          <p className="text-lg font-semibold tabular-nums">{formatMinutes(week)}</p>
        </div>
        <p className="mt-0.5 text-sm text-brand-ink/60">
          Since {formatBarnDayLabel(weekStart)}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Today</h2>
        <PunchList punches={todaysPunches} emptyLabel="No punches yet today." />
      </section>
    </TabPage>
  );
}
