import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { ShowsHub } from "@/components/ShowsHub";
import { ShowCreateButton } from "@/components/ShowCreateButton";
import { LessonsSegments } from "@/components/LessonsSegments";
import { EmptyState } from "@/components/ui/primitives";
import { requireTab } from "@/lib/guard";
import { canManageShows, listShows, splitShows } from "@/lib/shows";
import { barnToday } from "@/lib/dates";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Shows" };

export default async function ShowsPage() {
  const role = await requireTab("/lessons");
  const tabs = <LessonsSegments role={role} current="/lessons/shows" />;

  if (!featureEnabled("shows")) {
    return (
      <TabPage title="Lessons" tabs={tabs}>
        <StubScreen heading="Shows" phase="Phase 2" />
      </TabPage>
    );
  }

  const [all, canManage] = await Promise.all([listShows(), canManageShows()]);

  // The create control sits in the masthead on the empty state too — an empty
  // hub is exactly when someone needs to add the first show, and a screen that
  // says "no shows yet" with no way to add one is a dead end.
  const action = canManage ? <ShowCreateButton today={barnToday()} /> : undefined;

  if (all.length === 0) {
    return (
      <TabPage title="Lessons" action={action} tabs={tabs}>
        <EmptyState title="No shows yet" />
      </TabPage>
    );
  }

  const { upcoming, results, pinned } = splitShows(all);

  return (
    <TabPage title="Lessons" action={action} tabs={tabs}>
      <ShowsHub
        upcoming={upcoming}
        results={results}
        pinned={pinned}
        isBarn={role === "admin" || role === "staff"}
      />
    </TabPage>
  );
}
