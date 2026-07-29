import Link from "next/link";
import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { CareTimeline } from "@/components/CareTimeline";
import { CareLogForm } from "@/components/CareLogForm";
import { DocumentList } from "@/components/DocumentList";
import { DocumentUploadForm } from "@/components/HorseDocuments";
import { listHorseDocuments } from "@/lib/documents";
import { currentRole } from "@/lib/guard";
import { getHorse, listFeedPlans, listHorseRiders } from "@/lib/horses";
import { listCareEvents, loggerNames, upcoming } from "@/lib/care";
import { barnToday, formatBarnDayLabel } from "@/lib/dates";
import { CARE_TYPE_LABELS, MEAL_LABELS } from "@/lib/types";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Horse" };

/**
 * A horse's record, read-only.
 *
 * There is no role branch guarding the fields here, and there does not need to
 * be: getHorse() returns null for anyone RLS does not let read the row, and the
 * only families it lets through are the owners. A family whose rider merely
 * rides the horse never reaches this page — their card does not link, and the
 * query behind it would return nothing if they typed the URL.
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

  const careOn = featureEnabled("care");
  const documentsOn = featureEnabled("documents");
  const [plans, riders, care, loggers, documents] = await Promise.all([
    listFeedPlans(id),
    listHorseRiders(id),
    careOn ? listCareEvents(id) : Promise.resolve([]),
    // The "logged by" line is a barn detail. A family sees what was done and
    // when, not which employee wrote it up.
    careOn && role !== "parent" ? loggerNames() : Promise.resolve(undefined),
    // Storage RLS filters this: the barn sees the folder, the owning family
    // sees the folder, anyone else gets an empty list.
    documentsOn ? listHorseDocuments(id) : Promise.resolve([]),
  ]);
  const activePlans = plans.filter((p) => p.active);
  const due = upcoming(care);

  const facts: [string, string][] = [
    horse.barn_name ? ["Barn name", horse.barn_name] : null,
    horse.breed ? ["Breed", horse.breed] : null,
    horse.dob ? ["Born", horse.dob] : null,
    !horse.active ? ["Status", "Retired"] : null,
  ].filter((f): f is [string, string] => f !== null);

  return (
    <TabPage title={horse.name}>
      {facts.length > 0 && (
        <section className="rounded-2xl border border-brand-ink/10 bg-white p-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-brand-ink/60">{label}</dt>
                <dd className="min-w-0 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {horse.notes && (
        <section className="rounded-2xl border border-brand-ink/10 bg-white p-4">
          <h2 className="text-base font-semibold">Notes</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-brand-ink/85">{horse.notes}</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Feed chart</h2>
        {activePlans.length === 0 ? (
          <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
            No feed chart set up yet.
          </p>
        ) : (
          activePlans.map((plan) => (
            <div key={plan.id} className="rounded-2xl border border-brand-ink/15 bg-white p-4">
              <h3 className="text-base font-semibold">{MEAL_LABELS[plan.meal]}</h3>
              <p className="mt-1 text-sm text-brand-ink/85">{plan.description}</p>
              {plan.supplements && (
                <p className="mt-1 text-sm text-brand-ink/70">
                  <span className="font-medium">Supplements:</span> {plan.supplements}
                </p>
              )}
              {plan.special_instructions && (
                <p className="mt-2 rounded-xl bg-brand-gold/25 p-3 text-sm font-medium text-brand-ink">
                  {plan.special_instructions}
                </p>
              )}
            </div>
          ))
        )}
      </section>

      {careOn && (
        <>
          {due.length > 0 && (
            <section className="rounded-2xl border border-brand-ink/10 bg-white p-4">
              <h2 className="text-base font-semibold">Coming up</h2>
              <ul className="mt-2 flex flex-col gap-1">
                {due.map((event) => (
                  <li key={event.id} className="text-sm text-brand-ink/85">
                    <span className="font-medium">{CARE_TYPE_LABELS[event.type]}</span> — due{" "}
                    {formatBarnDayLabel(event.due_next!)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-semibold">Care history</h2>
              <p className="text-sm text-brand-ink/60">
                {care.length === 0 ? "Nothing logged" : `${care.length} record(s)`}
              </p>
            </div>

            <CareTimeline
              events={care}
              today={barnToday()}
              loggerNames={loggers}
              emptyMessage={
                role === "parent"
                  ? "Nothing logged for this horse yet."
                  : "Nothing logged yet. Add the first record below."
              }
            />

            {role !== "parent" && (
              <div className="rounded-2xl border border-brand-ink/10 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-brand-ink/70">Log care</h3>
                <CareLogForm horseId={horse.id} today={barnToday()} />
              </div>
            )}
          </section>
        </>
      )}

      {documentsOn && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-semibold">Documents</h2>
            <p className="text-sm text-brand-ink/60">
              {documents.length === 0 ? "None yet" : `${documents.length}`}
            </p>
          </div>

          <DocumentList
            documents={documents}
            horseId={horse.id}
            canDelete={role !== "parent"}
            emptyMessage={
              role === "parent"
                ? "No documents for this horse yet."
                : "No documents yet. Add the first below."
            }
          />

          {role !== "parent" && (
            <div className="rounded-2xl border border-brand-ink/10 bg-white p-4">
              <DocumentUploadForm horseId={horse.id} />
            </div>
          )}
        </section>
      )}

      {riders.length > 0 && (
        <section className="rounded-2xl border border-brand-ink/10 bg-white p-4">
          <h2 className="text-base font-semibold">Riders</h2>
          <p className="mt-1 text-sm text-brand-ink/70">
            {riders.map((r) => r.name).join(", ")}
          </p>
        </section>
      )}

      <Link href="/more/horses" className="py-2 text-center text-sm font-medium underline">
        Back to horses
      </Link>

      {role === "staff" && (
        <Link href="/tasks/feed" className="py-2 text-center text-sm font-medium underline">
          Today&apos;s feed board
        </Link>
      )}
    </TabPage>
  );
}
