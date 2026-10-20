import "server-only";

import { cache } from "react";
import { listPunchesBetween } from "@/lib/punches";
import { addBarnDays, barnToday } from "@/lib/dates";
import { currentlyClockedIn } from "@/lib/timeclock";

/**
 * THE ONE CLOCKED-IN COMPUTATION. Every place the time clock appears — staff
 * Home, the staff member's own timesheet, /clock — reads its state from here,
 * so the three can never disagree about whether someone is on the clock.
 *
 * `cache` makes it once per request: /clock renders the button (via TimeClock)
 * AND reads the week's punches for its history, and that is one query.
 *
 * The window is the current barn week (Monday on), which is also what /clock
 * totals. An open punch older than that is not "on the clock" — it is a
 * forgotten clock-out, and the admin's timesheet screen is where that shows.
 * RLS returns only the signed-in staff member's own punches.
 */
export const loadClockState = cache(async () => {
  const today = barnToday();
  const isoDow = ((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const weekStart = addBarnDays(today, -(isoDow - 1));

  const weekPunches = await listPunchesBetween(`${weekStart}T00:00:00Z`, `${today}T23:59:59Z`);
  const openPunch = currentlyClockedIn(weekPunches);

  return { today, weekStart, weekPunches, clockedIn: Boolean(openPunch) };
});
