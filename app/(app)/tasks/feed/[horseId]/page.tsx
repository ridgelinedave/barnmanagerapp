import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { FeedChart } from "@/components/FeedChart";
import { requireTab } from "@/lib/guard";
import { familyNames, getHorse, listFeedPlans } from "@/lib/horses";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Feed chart" };

/**
 * One horse's feed chart.
 *
 * No ownership check here and none is needed: getHorse() runs on the caller's
 * session, and the row policy returns nothing for a horse this viewer cannot
 * see — so someone else's horse is a 404 rather than a forbidden page. Staff
 * and admin see every horse, which is the whole point of a feed board.
 */
export default async function FeedChartPage({
  params,
}: {
  params: Promise<{ horseId: string }>;
}) {
  await requireTab("/tasks");
  if (!featureEnabled("horses")) notFound();

  const { horseId } = await params;
  const horse = await getHorse(horseId);
  if (!horse) notFound();

  const [plans, families] = await Promise.all([
    listFeedPlans(horseId),
    horse.owner_family_id ? familyNames() : Promise.resolve(new Map<string, string>()),
  ]);

  return (
    <TabPage title="Feed chart" back="/tasks/feed">
      <FeedChart
        horse={horse}
        plans={plans.filter((plan) => plan.active)}
        ownerName={horse.owner_family_id ? (families.get(horse.owner_family_id) ?? null) : null}
      />
    </TabPage>
  );
}
