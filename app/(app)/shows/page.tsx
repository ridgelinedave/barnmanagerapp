import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { ShowsHub } from "@/components/ShowsHub";
import { ShowCreateButton } from "@/components/ShowCreateButton";
import { EmptyState } from "@/components/ui/primitives";
import { currentRole, requireTab } from "@/lib/guard";
import { canManageShows, listShows, splitShows } from "@/lib/shows";
import { barnToday } from "@/lib/dates";
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

  const [all, role, canManage] = await Promise.all([listShows(), currentRole(), canManageShows()]);

  // The create control sits in the masthead on the empty state too — an empty
  // hub is exactly when someone needs to add the first show, and a screen that
  // says "no shows yet" with no way to add one is a dead end.
  const action = canManage ? <ShowCreateButton today={barnToday()} /> : undefined;

  if (all.length === 0) {
    return (
      <TabPage title="Shows" action={action}>
        <EmptyState
          title="No shows yet"
          body={
            canManage
              ? "Add the first competition and it appears here with dates, entries and ride times."
              : "When the barn adds a competition it appears here with dates, entries and ride times."
          }
        />
      </TabPage>
    );
  }

  const { upcoming, results, pinned } = splitShows(all);

  return (
    <TabPage title="Shows" action={action}>
      <ShowsHub
        upcoming={upcoming}
        results={results}
        pinned={pinned}
        isBarn={role === "admin" || role === "staff"}
      />
    </TabPage>
  );
}
