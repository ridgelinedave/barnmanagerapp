import Link from "next/link";
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
      <TabPage title="Feed board">
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
    <TabPage title="Feed board">
      <FeedBoard board={board} />

      <Link href="/tasks" className="py-2 text-center text-sm font-medium underline">
        Back to tasks
      </Link>
    </TabPage>
  );
}
