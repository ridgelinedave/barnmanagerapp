import { ClockButton } from "@/components/ClockButton";
import { loadClockState } from "@/lib/clock-state";

/**
 * The time clock: the ONE mount of ClockButton with its server-computed state.
 *
 * Clocking in and out is the most repeated thing a staff member does — twice a
 * day, every day — so it is not buried two taps inside the Barn tab. The same
 * component, with the same state from `loadClockState`, sits in three places:
 *
 *   staff Home        the top card, one tap from launch
 *   My timesheet      at the top of their own hours
 *   /clock            the full screen, with today's punches and the week
 *
 * Do not fork it. A second copy of the button, or of the clocked-in check, is
 * how two screens come to disagree about whether someone is on the clock.
 */
export async function TimeClock() {
  const { clockedIn } = await loadClockState();
  return <ClockButton clockedIn={clockedIn} />;
}
