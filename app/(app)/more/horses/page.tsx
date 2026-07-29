import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { HorseBasicsCard, HorseCard } from "@/components/HorseCard";
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
        <StubScreen heading="Horses" phase="Phase 2">
          <p className="text-sm text-brand-ink/70">
            {role === "parent"
              ? "Your horse's record and feed chart land here."
              : "The horse directory and feed charts land here."}
          </p>
        </StubScreen>
      </TabPage>
    );
  }

  if (role === "parent") {
    const [owned, ridden] = await Promise.all([listHorses(), basicsForFamily()]);

    return (
      <TabPage title="Horses">
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Your horses</h2>
          {owned.length === 0 ? (
            <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
              You don&apos;t have a horse at the barn.
            </p>
          ) : (
            owned.map((horse) => (
              <HorseCard key={horse.id} horse={horse} href={`/more/horses/${horse.id}`} />
            ))
          )}
        </section>

        {ridden.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">Horses your rider rides</h2>
            {ridden.map((horse) => (
              <HorseBasicsCard key={horse.id} horse={horse} />
            ))}
            <p className="text-sm text-brand-ink/60">
              These belong to the barn or to another family, so their records stay with their
              owners.
            </p>
          </section>
        )}

        <Link href="/more" className="py-2 text-center text-sm font-medium underline">
          Back to More
        </Link>
      </TabPage>
    );
  }

  const [horses, families] = await Promise.all([listHorses(), familyNames()]);
  const inWork = horses.filter((h) => h.active);
  const retired = horses.filter((h) => !h.active);
  const detailHref = (id: string) =>
    role === "admin" ? `/manage/horses/${id}` : `/more/horses/${id}`;

  return (
    <TabPage title="Horses">
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold">In work</h2>
          <p className="text-sm text-brand-ink/60">{inWork.length}</p>
        </div>

        {inWork.length === 0 ? (
          <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
            No horses on the books yet.
          </p>
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
          <h2 className="text-sm font-semibold text-brand-ink/60">Retired ({retired.length})</h2>
          {retired.map((horse) => (
            <HorseCard key={horse.id} horse={horse} href={detailHref(horse.id)} />
          ))}
        </section>
      )}

      <Link href="/more" className="py-2 text-center text-sm font-medium underline">
        Back to More
      </Link>
    </TabPage>
  );
}
