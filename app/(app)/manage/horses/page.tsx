import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { HorseCard } from "@/components/HorseCard";
import { HorseForm } from "@/components/HorseAdmin";
import { requireTab } from "@/lib/guard";
import { familyNames, listHorses } from "@/lib/horses";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Horses" };

export default async function ManageHorsesPage() {
  await requireTab("/manage");

  if (!featureEnabled("horses")) {
    return (
      <TabPage title="Horses">
        <StubScreen heading="Horses" phase="Phase 2">
          <p className="text-sm text-brand-ink/70">
            Horse records, rider assignments and feed charts land here.
          </p>
        </StubScreen>
      </TabPage>
    );
  }

  const [horses, families] = await Promise.all([listHorses(), familyNames()]);

  const inWork = horses.filter((h) => h.active);
  const retired = horses.filter((h) => !h.active);

  const ownerLabel = (familyId: string | null) =>
    familyId ? (families.get(familyId) ?? "Owned") : "Barn horse";

  return (
    <TabPage title="Horses">
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold">In work</h2>
          <p className="text-sm text-brand-ink/60">
            {inWork.length === 0 ? "None yet" : `${inWork.length}`}
          </p>
        </div>

        {inWork.length === 0 ? (
          <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
            No horses yet. Add the first one below.
          </p>
        ) : (
          inWork.map((horse) => (
            <HorseCard
              key={horse.id}
              horse={horse}
              href={`/manage/horses/${horse.id}`}
              ownerLabel={ownerLabel(horse.owner_family_id)}
            />
          ))
        )}
      </section>

      {retired.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-brand-ink/60">Retired ({retired.length})</h2>
          {retired.map((horse) => (
            <HorseCard
              key={horse.id}
              horse={horse}
              href={`/manage/horses/${horse.id}`}
              ownerLabel={ownerLabel(horse.owner_family_id)}
            />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4">
        <h2 className="text-base font-semibold">Add a horse</h2>
        <HorseForm families={[...families].map(([id, name]) => ({ id, name }))} />
      </section>

      <Link href="/manage" className="py-2 text-center text-sm font-medium underline">
        Back to Manage
      </Link>
    </TabPage>
  );
}
