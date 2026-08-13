import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { ShowsHub } from "@/components/ShowsHub";
import { EmptyState } from "@/components/ui/primitives";
import { currentRole, requireTab } from "@/lib/guard";
import { listShows, splitShows } from "@/lib/shows";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Shows" };

export default async function ShowsPage() {
  await requireTab("/shows");

  if (!featureEnabled("shows")) {
    return (
      <TabPage title="Shows">
        <StubScreen
          heading="Shows"
          phase="Phase 2"
          detail="Where the barn is competing, who is entered, ride times and results."
        />
      </TabPage>
    );
  }

  const [all, role] = await Promise.all([listShows(), currentRole()]);

  if (all.length === 0) {
    return (
      <TabPage title="Shows">
        <EmptyState
          title="No shows yet"
          body="When the barn adds a competition it appears here with dates, entries and ride times."
        />
      </TabPage>
    );
  }

  const { upcoming, results, pinned } = splitShows(all);

  return (
    <TabPage title="Shows">
        <ShowsHub
        upcoming={upcoming}
        results={results}
        pinned={pinned}
        isBarn={role === "admin" || role === "staff"}
      />
    </TabPage>
  );
}
