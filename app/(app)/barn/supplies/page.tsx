import { TabPage } from "@/components/TabPage";
import { Card, Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { SheetTrigger } from "@/components/ui/Sheet";
import { SupplyAddForm, SupplyStatusButton } from "@/components/BarnOpsForms";
import { currentRole } from "@/lib/guard";
import { isRunningLow, listSupplies, type SupplyRow } from "@/lib/barn-ops";
import { listFamilies } from "@/lib/team";
import { SUPPLY_STATUS_LABELS } from "@/lib/types";

export const metadata = { title: "Supply list" };

/**
 * What is running out.
 *
 * TWO GROUPS, ALWAYS SEPARATED — Belle's words were "Crouse supply and boarder
 * supply", and they are different kinds of thing: one is stock the barn buys,
 * the other is a request to a household. Mixing them into one list sorted by
 * urgency would read as one shopping trip.
 *
 * A parent reaching this screen sees ONLY their own boarder items — that is
 * migration 0022's policy, not a filter here — so the Crouse group simply does
 * not render for them, and the heading on the other says "Your supplies".
 */
function amount(item: SupplyRow): string | null {
  if (item.quantity === null) return null;
  const n = Number(item.quantity);
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/\.?0+$/, "")}${item.unit ? ` ${item.unit}` : ""}`;
}

function SupplyCard({ item, isBarn }: { item: SupplyRow; isBarn: boolean }) {
  const low = isRunningLow(item);
  const qty = amount(item);

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-baseline gap-3">
        <h3 className="min-w-0 flex-1 font-display text-heading leading-snug text-ink">
          {item.name}
        </h3>
        {low && <Chip value="Running low" icon="alert" tone="gold" />}
      </div>

      <ChipRow>
        <Chip value={SUPPLY_STATUS_LABELS[item.status]} />
        {qty && <Chip value={qty} />}
        {item.category && <Chip value={item.category} />}
        {item.familyName && isBarn && <Chip value={item.familyName} />}
        {item.horseName && <Chip value={item.horseName} icon="horse" />}
      </ChipRow>

      {item.notes && <p className="text-caption text-muted">{item.notes}</p>}

      {isBarn && item.status !== "received" && (
        <div className="flex flex-wrap gap-2">
          {item.status === "needed" && (
            <SupplyStatusButton id={item.id} next="ordered" label="Mark ordered" />
          )}
          <SupplyStatusButton id={item.id} next="received" label="Mark received" />
        </div>
      )}
    </Card>
  );
}

export default async function SuppliesPage() {
  const role = await currentRole();
  const isBarn = role === "admin" || role === "staff";

  const [items, families] = await Promise.all([
    listSupplies(),
    isBarn ? listFamilies() : Promise.resolve([]),
  ]);

  const barn = items.filter((i) => i.scope === "barn");
  const boarder = items.filter((i) => i.scope === "boarder");

  return (
    <TabPage
      title="Supply list"
      back="/barn"
      action={
        isBarn ? (
          <SheetTrigger label="Add" title="Add a supply item" variant="primary">
            <SupplyAddForm families={families} />
          </SheetTrigger>
        ) : undefined
      }
    >
      {items.length === 0 && (
        <EmptyState
          title={isBarn ? "Nothing on the list" : "Nothing needed from you"}
          body={
            isBarn
              ? "Add something as it starts running low and it appears here."
              : "If the barn needs you to bring something for your horse, it shows up here."
          }
        />
      )}

      {isBarn && barn.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Crouse supply" count={`${barn.length}`} />
          {barn.map((item) => (
            <SupplyCard key={item.id} item={item} isBarn={isBarn} />
          ))}
        </section>
      )}

      {boarder.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title={isBarn ? "Boarder supply" : "Your supplies"}
            count={`${boarder.length}`}
          />
          {boarder.map((item) => (
            <SupplyCard key={item.id} item={item} isBarn={isBarn} />
          ))}
        </section>
      )}
    </TabPage>
  );
}
