import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { AssignRiderForm, FeedPlanForm, HorseForm } from "@/components/HorseAdmin";
import { Card, EmptyState, SectionHeader, Sunk } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { SheetTrigger } from "@/components/ui/Sheet";
import { requireTab } from "@/lib/guard";
import {
  familyNames,
  getHorse,
  listAssignableRiders,
  listFeedPlans,
  listHorseRiders,
} from "@/lib/horses";
import { CareTimeline } from "@/components/CareTimeline";
import { CareLogForm } from "@/components/CareLogForm";
import { DocumentList } from "@/components/DocumentList";
import { DocumentUploadForm } from "@/components/HorseDocuments";
import { listCareEvents, loggerNames } from "@/lib/care";
import { listHorseDocuments } from "@/lib/documents";
import { barnToday } from "@/lib/dates";
import { MEAL_LABELS } from "@/lib/types";
import { featureEnabled } from "@/config/barn";
import { deleteHorse, retireFeedPlan, unassignRider } from "../actions";

export const metadata = { title: "Horse" };

export default async function ManageHorsePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireTab("/manage");
  if (!featureEnabled("horses")) notFound();

  const { id } = await params;
  const horse = await getHorse(id);
  if (!horse) notFound();

  const careOn = featureEnabled("care");
  const documentsOn = featureEnabled("documents");
  const [families, riders, allRiders, plans, care, loggers, documents] = await Promise.all([
    familyNames(),
    listHorseRiders(id),
    listAssignableRiders(),
    listFeedPlans(id),
    careOn ? listCareEvents(id) : Promise.resolve([]),
    careOn ? loggerNames() : Promise.resolve(new Map<string, string>()),
    documentsOn ? listHorseDocuments(id) : Promise.resolve([]),
  ]);

  const assigned = new Set(riders.map((r) => r.id));
  const unassigned = allRiders.filter((r) => !assigned.has(r.id));
  const activePlans = plans.filter((p) => p.active);
  const retiredPlans = plans.filter((p) => !p.active);

  return (
    <TabPage
      title={horse.name}
      back="/manage/horses"
      subject={{ name: horse.name, meta: horse.breed ?? undefined, photoUrl: horse.photo_url }}
    >
      <SheetTrigger label="Edit details" title={`Edit ${horse.name}`}>
        <HorseForm horse={horse} families={[...families].map(([fid, name]) => ({ id: fid, name }))} />
      </SheetTrigger>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Riders"
          count={riders.length === 0 ? "Nobody assigned" : `${riders.length} assigned`}
        />

        {riders.map((rider) => (
          <Card key={rider.id} className="flex min-h-14 items-center gap-3 p-4">
            <span className="min-w-0 flex-1 text-body font-medium text-ink">{rider.name}</span>
            <form action={unassignRider}>
              <input type="hidden" name="horse_id" value={horse.id} />
              <input type="hidden" name="rider_id" value={rider.id} />
              <Button type="submit" variant="secondary">
                Remove
              </Button>
            </form>
          </Card>
        ))}

        <Card className="p-4">
          <AssignRiderForm
            horseId={horse.id}
            riders={unassigned.map((r) => ({ id: r.id, name: r.name }))}
          />
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Feed chart"
          count={activePlans.length === 0 ? "Not set up" : `${activePlans.length} meals`}
        />

        {activePlans.length === 0 && (
          <EmptyState
            title="No feed chart yet"
            body="Set the morning and evening feeds below and this horse joins the feed board staff read at 6am."
          />
        )}

        {activePlans.map((plan) => (
          <Card key={plan.id} className="p-4">
            <h3 className="font-display text-heading text-ink">{MEAL_LABELS[plan.meal]}</h3>
            <p className="mt-1 text-caption text-ink">{plan.description}</p>
            {plan.supplements && (
              <p className="mt-1 text-caption text-muted">
                <span className="font-medium text-ink">Supplements:</span> {plan.supplements}
              </p>
            )}
            {plan.special_instructions && (
              <Sunk tone="gold" className="mt-2">
                <p className="text-caption font-medium">{plan.special_instructions}</p>
              </Sunk>
            )}
            <form action={retireFeedPlan} className="mt-3">
              <input type="hidden" name="id" value={plan.id} />
              <input type="hidden" name="horse_id" value={horse.id} />
              <Button type="submit" variant="secondary" block>
                Retire this meal
              </Button>
            </form>
          </Card>
        ))}

        <SheetTrigger label="Set a meal" title="Feed chart">
          <FeedPlanForm horseId={horse.id} current={activePlans} />
        </SheetTrigger>

        {retiredPlans.length > 0 && (
          <details className="rounded-card border border-line bg-surface p-4">
            <summary className="flex min-h-11 cursor-pointer items-center font-display text-heading text-ink">
              Previous feed charts ({retiredPlans.length})
            </summary>
            <ul className="mt-3 flex flex-col gap-2">
              {retiredPlans.map((plan) => (
                <li key={plan.id} className="text-caption text-muted">
                  <span className="font-medium text-ink">{MEAL_LABELS[plan.meal]}:</span>{" "}
                  {plan.description}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {careOn && (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Care history"
            count={care.length === 0 ? "Nothing logged" : `${care.length} records`}
          />

          <SheetTrigger label="Log care" title="Log care" variant="primary">
            <CareLogForm horseId={horse.id} today={barnToday()} />
          </SheetTrigger>

          {care.length === 0 ? (
            <EmptyState
              title="Nothing logged yet"
              body="Vaccines, worming, farrier and vet visits go here. The first one you log starts the history."
            />
          ) : (
            <CareTimeline events={care} today={barnToday()} loggerNames={loggers} />
          )}
        </section>
      )}

      {documentsOn && (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Documents"
            count={documents.length === 0 ? "None yet" : `${documents.length}`}
          />

          {documents.length === 0 ? (
            <EmptyState
              title="No papers on file"
              body="Coggins, papers and vet reports. Owner-only."
            />
          ) : (
            <DocumentList documents={documents} horseId={horse.id} canDelete />
          )}

          <Card className="p-4">
            <DocumentUploadForm horseId={horse.id} />
          </Card>
        </section>
      )}

      {/* Destructive, and last — separated from everything else on the screen. */}
      <form action={deleteHorse}>
        <input type="hidden" name="id" value={horse.id} />
        <Button type="submit" variant="danger" block>
          Delete {horse.name}
        </Button>
      </form>
    </TabPage>
  );
}
