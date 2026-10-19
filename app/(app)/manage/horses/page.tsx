import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { HorseCard } from "@/components/HorseCard";
import { HorseForm } from "@/components/HorseAdmin";
import { EmptyState, SectionHeader } from "@/components/ui/primitives";
import {
  DESKTOP_ONLY,
  DataTable,
  MOBILE_ONLY,
  parseSort,
  sortHrefFor,
  sortRows,
  type Row,
  type SortState,
} from "@/components/ui/DataTable";
import { SheetTrigger } from "@/components/ui/Sheet";
import { requireTab } from "@/lib/guard";
import { familyNames, listHorses } from "@/lib/horses";
import { formatHands } from "@/lib/horse-display";
import { featureEnabled } from "@/config/barn";
import type { Horse } from "@/lib/types";

export const metadata = { title: "Horses" };

const SORTABLE = ["name", "barn", "colour", "height", "breed", "owner"];

/**
 * The barn's horses.
 *
 * A horse IS a card — on its own profile. A list of twenty horses with six
 * facts each is a table on the desk, so the desktop shell gets one, and the
 * phone keeps the horse cards it scans with a thumb.
 */
function HorseTable({
  caption,
  horses,
  ownerLabel,
  sort,
}: {
  caption: string;
  horses: Horse[];
  ownerLabel: (familyId: string | null) => string;
  sort: SortState;
}) {
  const rows: Row[] = horses.map((horse) => ({
    key: horse.id,
    href: `/manage/horses/${horse.id}`,
    muted: !horse.active,
    sort: {
      name: horse.name,
      barn: horse.barn_name,
      colour: [horse.colour, horse.sex].filter(Boolean).join(" "),
      height: horse.height_hands,
      breed: horse.breed,
      owner: ownerLabel(horse.owner_family_id),
    },
    cells: {
      name: horse.name,
      barn: horse.barn_name ?? "—",
      colour: [horse.colour, horse.sex].filter(Boolean).join(" ") || "—",
      height: horse.height_hands === null ? "—" : formatHands(horse.height_hands),
      breed: horse.breed ?? "—",
      owner: ownerLabel(horse.owner_family_id),
    },
  }));

  return (
    <DataTable
      caption={caption}
      columns={[
        { key: "name", label: "Horse", sortable: true },
        { key: "barn", label: "Barn name", sortable: true },
        { key: "colour", label: "Colour & sex", sortable: true },
        { key: "height", label: "Height", numeric: true, sortable: true },
        { key: "breed", label: "Breed", sortable: true },
        { key: "owner", label: "Owner", sortable: true },
      ]}
      rows={sortRows(rows, sort.key, sort.dir)}
      sort={sort}
    />
  );
}

export default async function ManageHorsesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  await requireTab("/manage");

  if (!featureEnabled("horses")) {
    return (
      <TabPage title="Horses">
        <StubScreen heading="Horses" phase="Phase 2" />
      </TabPage>
    );
  }

  const params = await searchParams;
  const sort: SortState = {
    ...parseSort(params, SORTABLE, { key: "name", dir: "asc" }),
    href: sortHrefFor("/manage/horses", params),
  };

  const [horses, families] = await Promise.all([listHorses(), familyNames()]);

  const inWork = horses.filter((h) => h.active);
  const retired = horses.filter((h) => !h.active);

  const ownerLabel = (familyId: string | null) =>
    familyId ? (families.get(familyId) ?? "Owned") : "Barn horse";

  const addHorse = (
    <SheetTrigger label="Add a horse" title="New horse" variant="primary">
      <HorseForm families={[...families].map(([id, name]) => ({ id, name }))} />
    </SheetTrigger>
  );

  return (
    <TabPage
      title="Horses"
      back="/barn"
      layout="wide"
      density="tight"
      action={<div className="hidden lg:block">{addHorse}</div>}
    >
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="In work"
          count={inWork.length === 0 ? "None yet" : `${inWork.length}`}
        />

        {inWork.length === 0 ? (
          <EmptyState title="No horses yet" />
        ) : (
          <>
            <div className={`flex flex-col gap-3 ${MOBILE_ONLY}`}>
              {inWork.map((horse) => (
                <HorseCard
                  key={horse.id}
                  horse={horse}
                  href={`/manage/horses/${horse.id}`}
                  ownerLabel={ownerLabel(horse.owner_family_id)}
                />
              ))}
            </div>
            <div className={DESKTOP_ONLY}>
              <HorseTable caption="Horses in work" horses={inWork} ownerLabel={ownerLabel} sort={sort} />
            </div>
          </>
        )}
      </section>

      {retired.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Retired" count={`${retired.length}`} />
          <div className={`flex flex-col gap-3 ${MOBILE_ONLY}`}>
            {retired.map((horse) => (
              <HorseCard
                key={horse.id}
                horse={horse}
                href={`/manage/horses/${horse.id}`}
                ownerLabel={ownerLabel(horse.owner_family_id)}
              />
            ))}
          </div>
          <div className={DESKTOP_ONLY}>
            <HorseTable caption="Retired horses" horses={retired} ownerLabel={ownerLabel} sort={sort} />
          </div>
        </section>
      )}

      <div className={MOBILE_ONLY}>{addHorse}</div>
    </TabPage>
  );
}
