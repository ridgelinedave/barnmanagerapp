import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
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
      <TabPage title="Horses">
        <StubScreen
          heading="Horses"
          phase="Phase 2"
          detail={
            role === "parent"
              ? "Your horse's record and feed chart."
              : "The horse directory and feed charts."
          }
        />
      </TabPage>
    );
  }

  if (role === "parent") {
    const [owned, ridden] = await Promise.all([listHorses(), basicsForFamily()]);

    return (
      <TabPage title="Horses" back="/more">
        {/* Only rendered when the family actually owns one — a section with
            nothing in it does not render. */}
        {owned.length > 0 && (
          <section className="flex flex-col gap-3">
            <SectionHeader title="Your horses" />
            {owned.map((horse) => (
              <HorseCard key={horse.id} horse={horse} href={`/more/horses/${horse.id}`} />
            ))}
          </section>
        )}

        {ridden.length > 0 && (
          <section className="flex flex-col gap-3">
            <SectionHeader title="Horses your rider rides" />
            {ridden.map((horse) => (
              <HorseBasicsCard key={horse.id} horse={horse} />
            ))}
            <p className="text-caption text-muted">
              These belong to the barn or to another family, so their records stay with their
              owners.
            </p>
          </section>
        )}

        {owned.length === 0 && ridden.length === 0 && (
          <EmptyState
            title="No horses yet"
            body="When your rider is matched with a horse it appears here. If your family owns one, its record and feed chart show up too."
            emoji="🐴"
          />
        )}
      </TabPage>
    );
  }

  const [horses, families] = await Promise.all([listHorses(), familyNames()]);
  const inWork = horses.filter((h) => h.active);
  const retired = horses.filter((h) => !h.active);
  const detailHref = (id: string) =>
    role === "admin" ? `/manage/horses/${id}` : `/more/horses/${id}`;

  return (
    <TabPage title="Horses" back="/more">
      <section className="flex flex-col gap-3">
        <SectionHeader title="In work" count={`${inWork.length}`} />

        {inWork.length === 0 ? (
          <EmptyState
            title="No horses on the books"
            body="Belle adds horses from Manage. Once they are on, their feed charts show up on the feed board."
            emoji="🐴"
          />
        ) : (
          inWork.map((horse) => (
            <HorseCard
              key={horse.id}
              horse={horse}
              href={detailHref(horse.id)}
              ownerLabel={
                horse.owner_family_id
                  ? (families.get(horse.owner_family_id) ?? "Owned")
                  : "Barn horse"
              }
            />
          ))
        )}
      </section>

      {retired.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Retired" count={`${retired.length}`} />
          {retired.map((horse) => (
            <HorseCard key={horse.id} horse={horse} href={detailHref(horse.id)} />
          ))}
        </section>
      )}
    </TabPage>
  );
}
