import { TabPage } from "@/components/TabPage";
import { horsePhotoUrls } from "@/lib/media";
import { StubScreen } from "@/components/StubScreen";
import { RowList } from "@/components/ui/ListRow";
import { HorseBasicsCard, HorseCard } from "@/components/HorseCard";
import { EmptyState, SectionHeader } from "@/components/ui/primitives";
import { currentRole } from "@/lib/guard";
import { basicsForFamily, familyNames, listHorses } from "@/lib/horses";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Horses" };

/**
 * The horse directory, for whoever is looking.
 *
 * Staff and admin get every horse in full. A parent gets two lists that come
 * from two different places in the database, and the split is not cosmetic:
 *
 *   "Your horses"          the horses table — full records, RLS-scoped to the
 *                          family that owns them
 *   "Horses <rider> rides" horses_basics() — a projection that cannot return
 *                          breed, dob or notes at all
 *
 * The second list therefore renders through a component that has no way to
 * display those fields, because the data does not carry them.
 */
export default async function HorseDirectoryPage() {
  const role = await currentRole();

  if (!featureEnabled("horses")) {
    return (
      <TabPage density="tight" title="Horses">
        <StubScreen heading="Horses" phase="Phase 2" />
      </TabPage>
    );
  }

  if (role === "parent") {
    const [owned, ridden] = await Promise.all([listHorses(), basicsForFamily()]);
    const photos = await horsePhotoUrls([...owned, ...ridden]);

    return (
      <TabPage density="tight" title="Horses" back="/more">
        {/* Only rendered when the family actually owns one — a section with
            nothing in it does not render. */}
        {owned.length > 0 && (
          <section className="flex flex-col gap-3">
            <SectionHeader title="Your horses" />
            <RowList>
              {owned.map((horse) => (
                <HorseCard key={horse.id} horse={horse} href={`/more/horses/${horse.id}`} photoSrc={photos.get(horse.id)} />
              ))}
            </RowList>
          </section>
        )}

        {ridden.length > 0 && (
          <section className="flex flex-col gap-3">
            <SectionHeader title="Horses ridden" />
            <RowList>
              {ridden.map((horse) => (
                <HorseBasicsCard key={horse.id} horse={horse} photoSrc={photos.get(horse.id)} />
              ))}
            </RowList>
            <p className="text-caption text-muted">
              Records stay with each horse&apos;s owner.
            </p>
          </section>
        )}

        {owned.length === 0 && ridden.length === 0 && (
          <EmptyState title="No horses yet" />
        )}
      </TabPage>
    );
  }

  const [horses, families] = await Promise.all([listHorses(), familyNames()]);
  const photos = await horsePhotoUrls(horses);
  const inWork = horses.filter((h) => h.active);
  const retired = horses.filter((h) => !h.active);
  const detailHref = (id: string) =>
    role === "admin" ? `/manage/horses/${id}` : `/more/horses/${id}`;

  return (
    <TabPage density="tight" title="Horses" back="/more">
      <section className="flex flex-col gap-3">
        <SectionHeader title="In work" count={`${inWork.length}`} />

        {inWork.length === 0 ? (
          <EmptyState title="No horses yet" />
        ) : (
          <RowList>
          {inWork.map((horse) => (
            <HorseCard
              key={horse.id}
              horse={horse}
              href={detailHref(horse.id)}
              photoSrc={photos.get(horse.id)}
              ownerLabel={
                horse.owner_family_id
                  ? (families.get(horse.owner_family_id) ?? "Owned")
                  : "Barn horse"
              }
            />
          ))}
          </RowList>
        )}
      </section>

      {retired.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Retired" count={`${retired.length}`} />
          <RowList>
            {retired.map((horse) => (
              <HorseCard key={horse.id} horse={horse} href={detailHref(horse.id)} photoSrc={photos.get(horse.id)} />
            ))}
          </RowList>
        </section>
      )}
    </TabPage>
  );
}
