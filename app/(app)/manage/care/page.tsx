import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { SendCareDigestButton } from "@/components/CareLogForm";
import { Card, Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { ListRow } from "@/components/ui/ListRow";
import { requireTab } from "@/lib/guard";
import { careDueSoon, CARE_DUE_SOON_DAYS } from "@/lib/care";
import { barnToday, formatBarnDayLabel } from "@/lib/dates";
import { CARE_TYPE_LABELS } from "@/lib/types";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Care due" };

export default async function ManageCarePage() {
  await requireTab("/manage");

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

  return (
    <TabPage title="Care due" back="/manage">
      <p className="text-caption text-muted">
        Everything falling due in the next {CARE_DUE_SOON_DAYS} days, soonest first.
      </p>

      {due.length === 0 ? (
        <EmptyState
          title="Nothing due"
          body={`No vaccine, Coggins, worming or farrier date falls inside the next ${CARE_DUE_SOON_DAYS} days. Log care on a horse and set its next-due date to see it here.`}
          emoji="🌿"
        />
      ) : (
        <>
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
