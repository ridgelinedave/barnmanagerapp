import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { requireTab, currentRole } from "@/lib/guard";

export const metadata = { title: "Shows" };

export default async function ShowsPage() {
  await requireTab("/shows");
  const role = await currentRole();

  return (
    <TabPage title="Shows">
      <StubScreen heading="Shows" phase="Phase 3">
        <p className="text-sm text-brand-ink/70">
          {role === "admin"
            ? "Show creation, status controls, interest tally and nudges, the entries builder, ride times, the show-day thread, and scores land here."
            : "Interest polls, your rider's tests and ride times, logistics, the show-day thread, and scores land here."}
        </p>
      </StubScreen>
    </TabPage>
  );
}
