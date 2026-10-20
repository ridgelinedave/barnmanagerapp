import { TabPage } from "@/components/TabPage";
import { Chip, ChipRow, EmptyState } from "@/components/ui/primitives";
import { ListRow, RowList } from "@/components/ui/ListRow";
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
import { requireTab } from "@/lib/guard";
import { barnToday, formatBarnDayLabel, formatTime } from "@/lib/dates";
import { CLIENT_STATUS_LABELS, listClients, type ClientRow, type ClientStatus } from "@/lib/clients";

export const metadata = { title: "Clients" };

/**
 * Every client the barn has — the owner's CRM. Admin only.
 *
 * A boarder, a lesson family and an adult amateur are all a client; the Kind
 * column is DERIVED from what they have (riders, horses), never stored, so it
 * cannot disagree with the facts. Rows on a phone; a sortable table on the
 * desk, per the two-shell rule.
 *
 * Status (Active / Inactive / On a break) appears once migration 0026 is
 * applied and the `clientStatus` flag is on. Until then the column is absent
 * rather than showing a value nobody set.
 */
const STATUS_ORDER: Record<ClientStatus, number> = { active: 0, on_break: 1, inactive: 2 };
const SORTABLE = ["name", "status", "kind", "riders", "horses", "next", "forms"];

const nextLabel = (c: ClientRow) =>
  c.nextLesson ? `${formatBarnDayLabel(c.nextLesson.date)}, ${formatTime(c.nextLesson.time)}` : null;

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireTab("/manage/clients");

  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const sortState = parseSort({ sort: one(params.sort), dir: one(params.dir) }, SORTABLE, {
    key: "name",
    dir: "asc",
  });
  const sort = { ...sortState, href: sortHrefFor("/manage/clients", params) };

  const clients = await listClients(barnToday());
  const withStatus = clients.some((c) => c.status !== null);

  const columns: Column[] = [
    { key: "name", label: "Client", sortable: true },
    ...(withStatus ? [{ key: "status", label: "Status", sortable: true }] : []),
    { key: "kind", label: "Kind", sortable: true },
    { key: "riders", label: "Riders", sortable: true },
    { key: "horses", label: "Horses", sortable: true },
    { key: "next", label: "Next lesson", sortable: true },
    { key: "forms", label: "Forms owed", numeric: true, sortable: true },
  ];

  const rows: Row[] = clients.map((c) => ({
    key: c.id,
    muted: c.status === "inactive",
    sort: {
      name: c.name,
      status: c.status ? STATUS_ORDER[c.status] : null,
      kind: c.kind,
      riders: c.riders.length,
      horses: c.horses.length,
      next: c.nextLesson ? `${c.nextLesson.date}${c.nextLesson.time}` : null,
      forms: c.pendingForms,
    },
    cells: {
      name: <span className="font-display text-[1.0625rem]">{c.name}</span>,
      status: c.status ? CLIENT_STATUS_LABELS[c.status] : "—",
      kind: c.kind,
      riders: c.riders.join(", ") || "—",
      horses: c.horses.join(", ") || "—",
      next: nextLabel(c) ?? "—",
      forms: c.pendingForms || "—",
    },
  }));

  return (
    <TabPage title="Clients" back="/barn" layout="wide" density="tight">
      {clients.length === 0 ? (
        <EmptyState title="No clients yet" />
      ) : (
        <>
          <div className={MOBILE_ONLY}>
            <RowList>
              {clients.map((c) => (
                <ListRow
                  key={c.id}
                  title={c.name}
                  muted={c.status === "inactive"}
                  meta={[
                    c.riders.length ? count(c.riders.length, "rider", "riders") : null,
                    c.horses.length ? count(c.horses.length, "horse", "horses") : null,
                    nextLabel(c) ? `Next ${nextLabel(c)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || c.kind}
                  chips={
                    c.status || c.pendingForms ? (
                      <ChipRow>
                        {c.status && c.status !== "active" && <Chip value={CLIENT_STATUS_LABELS[c.status]} />}
                        {c.pendingForms > 0 && (
                          <Chip value={count(c.pendingForms, "form owed", "forms owed")} tone="gold" />
                        )}
                      </ChipRow>
                    ) : undefined
                  }
                />
              ))}
            </RowList>
          </div>
          <div className={DESKTOP_ONLY}>
            <DataTable
              caption="Clients"
              columns={columns}
              rows={sortRows(rows, sort.key, sort.dir)}
              sort={sort}
            />
          </div>
        </>
      )}
    </TabPage>
  );
}
