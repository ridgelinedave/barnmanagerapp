import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { HorseCard } from "@/components/HorseCard";
import { HorseForm } from "@/components/HorseAdmin";
import { EmptyState, SectionHeader } from "@/components/ui/primitives";
import { SheetTrigger } from "@/components/ui/Sheet";
import { requireTab } from "@/lib/guard";
import { familyNames, listHorses } from "@/lib/horses";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Horses" };

export default async function ManageHorsesPage() {
  await requireTab("/manage");

  if (!featureEnabled("horses")) {
    return (
      <TabPage title="Horses">
        <StubScreen
          heading="Horses"
          phase="Phase 2"
          detail="Horse records, rider assignments and feed charts."
        />
      </TabPage>
    );
  }

  const [horses, families] = await Promise.all([listHorses(), familyNames()]);

  const inWork = horses.filter((h) => h.active);
  const retired = horses.filter((h) => !h.active);

  const ownerLabel = (familyId: string | null) =>
    familyId ? (families.get(familyId) ?? "Owned") : "Barn horse";

  return (
    <TabPage title="Horses" back="/manage">
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="In work"
          count={inWork.length === 0 ? "None yet" : `${inWork.length}`}
        />

        {inWork.length === 0 ? (
          <EmptyState
            title="No horses yet"
            body="Add the first one below."
          />
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
          <SectionHeader title="Retired" count={`${retired.length}`} />
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

      <SheetTrigger label="Add a horse" title="New horse" variant="primary">
        <HorseForm families={[...families].map(([id, name]) => ({ id, name }))} />
      </SheetTrigger>
    </TabPage>
  );
}
