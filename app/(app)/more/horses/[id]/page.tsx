import Link from "next/link";
import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { CareTimeline } from "@/components/CareTimeline";
import { CareLogForm } from "@/components/CareLogForm";
import { DocumentList } from "@/components/DocumentList";
import { DocumentUploadForm } from "@/components/HorseDocuments";
import {
  Board,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  FactList,
  SectionHeader,
  Sunk,
} from "@/components/ui/primitives";
import { InlineRow } from "@/components/ui/ListRow";
import { SheetTrigger } from "@/components/ui/Sheet";
import { listHorseDocuments } from "@/lib/documents";
import { currentRole } from "@/lib/guard";
import { getHorse, listFeedPlans, listHorseRiders } from "@/lib/horses";
import { listCareEvents, loggerNames, upcoming } from "@/lib/care";
import { barnToday, formatBarnDayLabel } from "@/lib/dates";
import { CARE_TYPE_LABELS, MEAL_LABELS } from "@/lib/types";
import { barn, featureEnabled } from "@/config/barn";

export const metadata = { title: "Horse" };

/**
 * A horse's record.
 *
 * ONE SCROLL, NOT EIGHT TABS. The incumbent files a horse behind About /
 * Feeding / Turnout / Health / Weight / Hoof / Training / FlyOps, and most of
 * them open on "no record" — eight taps to find out there is nothing to find.
 * Here everything the barn knows is on one page in the order it gets asked
 * about, and a section that has nothing in it does not render at all. The page
 * gets longer as a horse's history does, which is the right way round.
 *
 * There is no role branch guarding the fields: getHorse() returns null for
 * anyone RLS does not let read the row, and the only families it lets through
 * are owners. A family whose rider merely rides the horse never reaches here.
 */
export default async function HorseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await currentRole();
  if (!featureEnabled("horses")) notFound();

  const { id } = await params;
  const horse = await getHorse(id);
  if (!horse) notFound();

  const isBarn = role !== "parent";
  const careOn = featureEnabled("care");
  const documentsOn = featureEnabled("documents");
  const [plans, riders, care, loggers, documents] = await Promise.all([
    listFeedPlans(id),
    listHorseRiders(id),
    careOn ? listCareEvents(id) : Promise.resolve([]),
    // The "logged by" line is a barn detail. A family sees what was done and
    // when, not which employee wrote it up.
    careOn && isBarn ? loggerNames() : Promise.resolve(undefined),
    // Storage RLS filters this: the barn sees the folder, the owning family
    // sees the folder, anyone else gets an empty list.
    documentsOn ? listHorseDocuments(id) : Promise.resolve([]),
  ]);
  const activePlans = plans.filter((p) => p.active);
  const due = upcoming(care);
  const today = barnToday();

  // A horse's birthday is asked about for the YEAR — the weekday is noise, and
  // formatBarnDayLabel drops the year entirely, which would leave "Wed, Apr 1".
  const born = horse.dob
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: barn.timezone,
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(`${horse.dob}T12:00:00Z`))
    : null;

  const facts: [string, string][] = [
    horse.breed ? ["Breed", horse.breed] : null,
    born ? ["Born", born] : null,
  ].filter((f): f is [string, string] => f !== null);

  // The header carries the identity, so the meta line is the two facts a person
  // standing in the aisle actually needs: what it is and who rides it.
  const headerMeta = [horse.breed, riders.length > 0 ? riders.map((r) => r.name).join(", ") : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <TabPage
      title={horse.name}
      back="/more/horses"
      subject={{ name: horse.name, meta: headerMeta || undefined, photoUrl: horse.photo_url }}
    >
      {/* Status at a glance — the things that change, before the things that don't. */}
      <ChipRow>
        {horse.barn_name && horse.barn_name !== horse.name && (
          <Chip label="Barn name" value={horse.barn_name} />
        )}
        {!horse.active && <Chip value="Retired" tone="neutral" />}
        {due.length > 0 && (
          <Chip
            value={`${due.length} due soon`}
            icon="alert"
            tone={due.some((e) => (e.due_next ?? "") < today) ? "danger" : "gold"}
          />
        )}
        {activePlans.length > 0 && (
          <Chip value={`${activePlans.length} meals`} icon="bucket" tone="forest" />
        )}
      </ChipRow>

      {/* What is coming up. Only rendered when there IS something coming up. */}
      {careOn && due.length > 0 && (
        <Board label="Coming up">
          {due.map((event) => {
            const overdue = (event.due_next ?? "") < today;
            return (
              <InlineRow
                key={event.id}
                icon={overdue ? "alert" : "clock"}
                tone={overdue ? "danger" : "ink"}
                label={CARE_TYPE_LABELS[event.type]}
                value={`${overdue ? "Overdue " : ""}${formatBarnDayLabel(event.due_next!)}`}
              />
            );
          })}
        </Board>
      )}

      {facts.length > 0 && (
        <Card className="p-4">
          <FactList facts={facts} />
          {horse.notes && (
            <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-caption text-ink">
              {horse.notes}
            </p>
          )}
        </Card>
      )}

      {/* Feed. The single most-consulted thing on a horse's page at 6am. */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Feed chart"
          count={activePlans.length === 0 ? undefined : `${activePlans.length} meals`}
        />
        {activePlans.length === 0 ? (
          <EmptyState
            title="No feed chart yet"
            body={
              isBarn
                ? "Set the morning and evening feeds on this horse and they will appear on the feed board."
                : "The barn has not set a feed chart for this horse yet."
            }
          />
        ) : (
          <Card className="flex flex-col gap-3 p-4">
            {activePlans.map((plan) => (
              <div key={plan.id}>
                <h3 className="font-display text-heading text-ink">{MEAL_LABELS[plan.meal]}</h3>
                <p className="mt-0.5 text-caption text-ink">{plan.description}</p>
                {plan.supplements && (
                  <p className="mt-0.5 text-caption text-muted">
                    <span className="font-medium text-ink">Supplements:</span> {plan.supplements}
                  </p>
                )}
                {plan.special_instructions && (
                  <Sunk tone="gold" className="mt-2">
                    <p className="text-caption font-medium">{plan.special_instructions}</p>
                  </Sunk>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>

      {careOn && (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Care history"
            count={care.length === 0 ? undefined : `${care.length} records`}
          />

          {/* Logging is a note, not a detour — so it is a sheet over this page
              rather than a form pushed to the bottom of it. */}
          {isBarn && (
            <SheetTrigger label="Log care" title="Log care" variant="primary">
              <CareLogForm horseId={horse.id} today={today} />
            </SheetTrigger>
          )}

          {care.length === 0 ? (
            <EmptyState
              title="Nothing logged yet"
              body={
                isBarn
                  ? "Vaccines, worming, farrier and vet visits go here. The first one you log starts the history."
                  : "When the barn logs a vaccine, a farrier visit or a vet call, it will show up here."
              }
            />
          ) : (
            <CareTimeline events={care} today={today} loggerNames={loggers} />
          )}
        </section>
      )}

      {documentsOn && (documents.length > 0 || isBarn) && (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Documents"
            count={documents.length === 0 ? undefined : `${documents.length}`}
          />
          {documents.length === 0 ? (
            <EmptyState
              title="No papers on file"
              body="Coggins, papers and vet reports. Owner-only."
            />
          ) : (
            <DocumentList documents={documents} horseId={horse.id} canDelete={isBarn} />
          )}
          {isBarn && (
            <Card className="p-4">
              <DocumentUploadForm horseId={horse.id} />
            </Card>
          )}
        </section>
      )}

      {riders.length > 0 && (
        <Card className="p-4">
          <h2 className="font-display text-heading text-ink">Who rides</h2>
          <p className="mt-1 text-caption text-muted">{riders.map((r) => r.name).join(", ")}</p>
        </Card>
      )}

      {role === "staff" && (
        <Link
          href="/tasks/feed"
          className="py-1 text-center text-label font-medium text-accent-text underline underline-offset-4"
        >
          Today&apos;s feed board
        </Link>
      )}
    </TabPage>
  );
}
