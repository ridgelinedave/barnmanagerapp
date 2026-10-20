import { TabPage } from "@/components/TabPage";
import { Card, Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import {
  DESKTOP_ONLY,
  DataTable,
  MOBILE_ONLY,
  parseSort,
  sortHrefFor,
  sortRows,
  type Column,
  type Row,
} from "@/components/ui/DataTable";
import { barn as barnConfig } from "@/config/barn";
import { SheetTrigger } from "@/components/ui/Sheet";
import { SupplyAddForm, SupplyStatusButton } from "@/components/BarnOpsForms";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { currentRole } from "@/lib/guard";
import { canManageBarnOps, isRunningLow, listSupplies, type SupplyRow } from "@/lib/barn-ops";
import { listFamilies } from "@/lib/team";
import { SUPPLY_STATUS_LABELS } from "@/lib/types";

export const metadata = { title: "Supplies" };

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

function SupplyCard({ item, isBarn, canDelete }: { item: SupplyRow; isBarn: boolean; canDelete: boolean }) {
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

      {canDelete && <ConfirmDelete table="supply_items" id={item.id} name={item.name} />}
    </Card>
  );
}

const SORTABLE = ["name", "status", "qty", "category", "family", "horse"];
// Needed before ordered before received: the order the work happens in.
const STATUS_ORDER: Record<SupplyRow["status"], number> = { needed: 0, ordered: 1, received: 2 };

/** The desktop register: one table per group, same columns. */
function SupplyTable({
  caption,
  items,
  isBarn,
  canDelete,
  sort,
}: {
  caption: string;
  items: SupplyRow[];
  isBarn: boolean;
  canDelete: boolean;
  sort: Parameters<typeof DataTable>[0]["sort"];
}) {
  const columns: Column[] = [
    { key: "name", label: "Item", sortable: true },
    { key: "status", label: "Status", sortable: true },
    { key: "qty", label: "Quantity", numeric: true, sortable: true },
    { key: "category", label: "Category", sortable: true },
    ...(isBarn ? [{ key: "family", label: "Family", sortable: true }] : []),
    { key: "horse", label: "Horse", sortable: true },
    { key: "notes", label: "Notes", className: "max-w-[22rem] text-muted" },
    ...(isBarn ? [{ key: "actions", label: "Actions", hideLabel: true, className: "w-px whitespace-nowrap" }] : []),
  ];

  const rows: Row[] = items.map((item) => {
    const low = isRunningLow(item);
    return {
      key: item.id,
      muted: item.status === "received",
      sort: {
        name: item.name,
        status: STATUS_ORDER[item.status],
        qty: item.quantity === null ? null : Number(item.quantity),
        category: item.category,
        family: item.familyName,
        horse: item.horseName,
      },
      cells: {
        name: item.name,
        status: (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <Chip value={SUPPLY_STATUS_LABELS[item.status]} />
            {low && <Chip value="Running low" icon="alert" tone="gold" />}
          </span>
        ),
        qty: amount(item) ?? "—",
        category: item.category || "—",
        family: item.familyName ?? "—",
        horse: item.horseName ?? "—",
        notes: item.notes ? <span className="line-clamp-1">{item.notes}</span> : "",
        actions: isBarn ? (
          <span className="flex items-start gap-1.5">
            {item.status === "needed" && (
              <SupplyStatusButton id={item.id} next="ordered" label="Mark ordered" />
            )}
            {item.status !== "received" && (
              <SupplyStatusButton id={item.id} next="received" label="Mark received" />
            )}
            {canDelete && <ConfirmDelete table="supply_items" id={item.id} name={item.name} />}
          </span>
        ) : null,
      },
    };
  });

  return <DataTable caption={caption} columns={columns} rows={sort ? sortRows(rows, sort.key, sort.dir) : rows} sort={sort} />;
}

export default async function SuppliesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const role = await currentRole();
  const isBarn = role === "admin" || role === "staff";
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const sortState = parseSort(
    { sort: one(params.sort), dir: one(params.dir) },
    SORTABLE,
    { key: "status", dir: "asc" },
  );
  const sort = { ...sortState, href: sortHrefFor("/barn/supplies", params) };

  const [items, families, canDelete] = await Promise.all([
    listSupplies(),
    isBarn ? listFamilies() : Promise.resolve([]),
    isBarn ? canManageBarnOps() : Promise.resolve(false),
  ]);

  const barn = items.filter((i) => i.scope === "barn");
  const boarder = items.filter((i) => i.scope === "boarder");
  // The barn's own name comes from config — "Crouse supply" was a hard-coded
  // barn fact in a heading, which a second barn would have inherited.
  const barnGroup = `${barnConfig.shortName} supply`;
  const boarderGroup = isBarn ? "Boarder supply" : "Your supplies";

  return (
    <TabPage
      title="Supplies"
      back="/barn"
      layout="wide"
      density="tight"
      action={
        isBarn ? (
          <SheetTrigger label="Add" title="Supply item" variant="primary">
            <SupplyAddForm families={families} />
          </SheetTrigger>
        ) : undefined
      }
    >
      {items.length === 0 && (
        <EmptyState title={isBarn ? "No supplies on the list" : "Nothing needed for your horse"} />
      )}

      {isBarn && barn.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title={barnGroup} count={`${barn.length}`} />
          <div className={`flex flex-col gap-3 ${MOBILE_ONLY}`}>
            {barn.map((item) => (
              <SupplyCard key={item.id} item={item} isBarn={isBarn} canDelete={canDelete} />
            ))}
          </div>
          <div className={DESKTOP_ONLY}>
            <SupplyTable caption={barnGroup} items={barn} isBarn={isBarn} canDelete={canDelete} sort={sort} />
          </div>
        </section>
      )}

      {boarder.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title={boarderGroup} count={`${boarder.length}`} />
          <div className={`flex flex-col gap-3 ${MOBILE_ONLY}`}>
            {boarder.map((item) => (
              <SupplyCard key={item.id} item={item} isBarn={isBarn} canDelete={canDelete} />
            ))}
          </div>
          <div className={DESKTOP_ONLY}>
            <SupplyTable caption={boarderGroup} items={boarder} isBarn={isBarn} canDelete={canDelete} sort={sort} />
          </div>
        </section>
      )}
    </TabPage>
  );
}
