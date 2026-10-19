import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { SendCareDigestButton } from "@/components/CareLogForm";
import { Card, Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { ListRow } from "@/components/ui/ListRow";
import {
  DESKTOP_ONLY,
  DataTable,
  MOBILE_ONLY,
  parseSort,
  sortHrefFor,
  sortRows,
  type Row,
} from "@/components/ui/DataTable";
import { requireTab } from "@/lib/guard";
import { careDueSoon, CARE_DUE_SOON_DAYS } from "@/lib/care";
import { barnToday, formatBarnDayLabel } from "@/lib/dates";
import { CARE_TYPE_LABELS } from "@/lib/types";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Care due" };

/** Whole days from `from` to `to`, both YYYY-MM-DD, read at UTC noon so no zone shifts them. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export default async function ManageCarePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  await requireTab("/manage");
  const params = await searchParams;
  const sortState = parseSort(params, ["horse", "type", "due"], { key: "due", dir: "asc" });

  if (!featureEnabled("care")) {
    return (
      <TabPage title="Care due">
        <StubScreen
          heading="Care due"
          phase="Phase 2"
          detail="Vaccines, Coggins, worming and farrier dates, and what is coming up."
        />
      </TabPage>
    );
  }

  const today = barnToday();
  const due = await careDueSoon();

  const overdue = due.filter((d) => (d.event.due_next ?? "") < today);
  const soon = due.filter((d) => (d.event.due_next ?? "") >= today);

  // Desktop: one table, overdue and coming-up together, sorted by due date by
  // default so the overdue rows lead.
  const rows: Row[] = due.map(({ event, horse }) => {
    const days = daysBetween(today, event.due_next!);
    const late = days < 0;
    return {
      key: event.id,
      href: `/manage/horses/${horse.id}`,
      sort: { horse: horse.name, type: CARE_TYPE_LABELS[event.type], due: event.due_next },
      cells: {
        horse: horse.name,
        type: CARE_TYPE_LABELS[event.type],
        due: formatBarnDayLabel(event.due_next!),
        days: late ? `${-days} overdue` : days === 0 ? "today" : `in ${days}`,
        status: late ? (
          <Chip value="Overdue" icon="alert" tone="danger" />
        ) : (
          <Chip value="Coming up" icon="clock" tone="gold" />
        ),
      },
    };
  });

  return (
    <TabPage title="Care due" back="/barn" layout="wide" density="tight">
      <p className="text-caption text-muted">
        Everything falling due in the next {CARE_DUE_SOON_DAYS} days, soonest first.
      </p>

      {due.length === 0 ? (
        <EmptyState
          title="Nothing due"
          body={`No vaccine, Coggins, worming or farrier date falls inside the next ${CARE_DUE_SOON_DAYS} days. Log care on a horse and set its next-due date to see it here.`}
        />
      ) : (
        <>
          <div className={DESKTOP_ONLY}>
            <DataTable
              caption="Care falling due"
              columns={[
                { key: "horse", label: "Horse", sortable: true },
                { key: "type", label: "Care", sortable: true },
                { key: "due", label: "Due", sortable: true },
                { key: "days", label: "Days", numeric: true },
                { key: "status", label: "Status" },
              ]}
              rows={sortRows(rows, sortState.key, sortState.dir)}
              sort={{ ...sortState, href: sortHrefFor("/manage/care", params) }}
            />
          </div>
          <div className={`flex flex-col gap-5 ${MOBILE_ONLY}`}>
          {/* Overdue only renders when something IS overdue. */}
          {overdue.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Overdue" count={`${overdue.length}`} />
              {overdue.map(({ event, horse }) => (
                <ListRow
                  key={event.id}
                  href={`/manage/horses/${horse.id}`}
                  title={horse.name}
                  meta={`${CARE_TYPE_LABELS[event.type]} · due ${formatBarnDayLabel(event.due_next!)}`}
                  chips={
                    <ChipRow>
                      <Chip value="Overdue" icon="alert" tone="danger" />
                    </ChipRow>
                  }
                />
              ))}
            </section>
          )}

          {soon.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Coming up" count={`${soon.length}`} />
              {soon.map(({ event, horse }) => (
                <ListRow
                  key={event.id}
                  href={`/manage/horses/${horse.id}`}
                  title={horse.name}
                  meta={`${CARE_TYPE_LABELS[event.type]} · due ${formatBarnDayLabel(event.due_next!)}`}
                  chips={
                    <ChipRow>
                      <Chip value={CARE_TYPE_LABELS[event.type]} icon="clock" tone="gold" />
                    </ChipRow>
                  }
                />
              ))}
            </section>
          )}
          </div>
        </>
      )}

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-display text-heading text-ink">Remind the barn</h2>
        <p className="text-caption text-muted">
          Sends a notification for each item above. Safe to press twice — an item already sent
          is not sent again.
        </p>
        <SendCareDigestButton />
      </Card>
    </TabPage>
  );
}
