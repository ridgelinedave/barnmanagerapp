import { Suspense } from "react";
import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { FeedBoard } from "@/components/FeedBoard";
import { SkeletonList } from "@/components/ui/Skeleton";
import { requireTab } from "@/lib/guard";
import { feedBoardByHorse } from "@/lib/horses";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Feed board" };

/** Streamed behind a skeleton so the list's shape is there before its data. */
async function Board() {
  return <FeedBoard board={await feedBoardByHorse()} />;
}

export default async function FeedBoardPage() {
  await requireTab("/tasks");

  if (!featureEnabled("horses")) {
    return (
      <TabPage title="Feed board" back="/tasks">
        <StubScreen heading="Feed board" phase="Phase 2" detail="The daily feed list, by horse." />
      </TabPage>
    );
  }

  return (
    // The way back is the header arrow, same as every other pushed screen.
    <TabPage title="Feed board" back="/tasks">
      <Suspense fallback={<SkeletonList rows={5} label="Loading the feed board" />}>
        <Board />
      </Suspense>
    </TabPage>
  );
}
