import { Suspense } from "react";
import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { FeedWhiteboard } from "@/components/FeedWhiteboard";
import { BoardClock } from "@/components/BoardClock";
import { SkeletonList } from "@/components/ui/Skeleton";
import { requireTab } from "@/lib/guard";
import { feedBoardByHorse } from "@/lib/horses";
import { careDueBetween, careRecentByHorse } from "@/lib/care";
import { barnToday } from "@/lib/dates";
import { buildBoard, currentMeal, formatBoardClock } from "@/lib/feed-board";
import { barn, featureEnabled } from "@/config/barn";
import type { CareEvent } from "@/lib/types";

export const metadata = { title: "Feed board" };

/** The barn's "HH:MM" right now, for picking the current meal. */
function barnClock(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: barn.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

/**
 * Streamed behind a skeleton so the board's shape is there before its data.
 * Three existing reads — the feed charts, care in the last three days, and
 * care falling due today — and no new SQL.
 */
async function Board({ now }: { now: Date }) {
  const today = barnToday();
  const [board, recent, due] = await Promise.all([
    feedBoardByHorse(),
    careRecentByHorse(),
    careDueBetween(today, today),
  ]);
  const dueToday = new Map<string, CareEvent[]>();
  for (const { event } of due) dueToday.set(event.horse_id, [...(dueToday.get(event.horse_id) ?? []), event]);

  const rows = buildBoard({ board, recent, dueToday, today, timezone: barn.timezone });
  return <FeedWhiteboard rows={rows} now={currentMeal(barnClock(now), barn.feedMealCutoffs)} />;
}

export default async function FeedBoardPage() {
  await requireTab("/tasks/feed");

  if (!featureEnabled("horses")) {
    return (
      <TabPage title="Feed board" back="/barn">
        <StubScreen heading="Feed board" phase="Phase 2" />
      </TabPage>
    );
  }

  const now = new Date();

  return (
    <TabPage
      title="Feed board"
      back="/barn"
      layout="wide"
      density="tight"
      header="board"
      headerMeta={<BoardClock initial={formatBoardClock(now, barn.timezone)} timezone={barn.timezone} />}
    >
      <Suspense fallback={<SkeletonList rows={5} label="Loading the feed board" />}>
        <Board now={now} />
      </Suspense>
    </TabPage>
  );
}
