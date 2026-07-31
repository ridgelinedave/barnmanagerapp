import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { requireTab, currentRole } from "@/lib/guard";

export const metadata = { title: "Shows" };

export default async function ShowsPage() {
  await requireTab("/shows");
  const role = await currentRole();

  return (
    <TabPage title="Shows">
      <StubScreen
        heading="Shows"
        phase="Phase 3"
        detail={
          role === "admin"
            ? "Interest polls, the entries builder, ride times, the show-day thread and scores."
            : "Interest polls, your rider's tests and ride times, logistics and scores."
        }
      />
    </TabPage>
  );
}
