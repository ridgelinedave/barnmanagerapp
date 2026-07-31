import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { FeedBoard } from "@/components/FeedBoard";
import { requireTab } from "@/lib/guard";
import { feedBoard } from "@/lib/horses";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Feed board" };

export default async function FeedBoardPage() {
  await requireTab("/tasks");

  if (!featureEnabled("horses")) {
    return (
      <TabPage title="Feed board" back="/tasks">
        <StubScreen
          heading="Feed board"
          phase="Phase 2"
          detail="The daily feed list, grouped by meal."
        />
      </TabPage>
    );
  }

  const board = await feedBoard();

  return (
    // The way back is the header arrow, same as every other pushed screen —
    // a link at the very bottom of a long feed list is a way out you have to
    // scroll to find.
    <TabPage title="Feed board" back="/tasks">
      <FeedBoard board={board} />
    </TabPage>
  );
}
