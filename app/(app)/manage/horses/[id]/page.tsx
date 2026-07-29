import Link from "next/link";
import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { AssignRiderForm, FeedPlanForm, HorseForm } from "@/components/HorseAdmin";
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
import { listCareEvents, loggerNames } from "@/lib/care";
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
  const [families, riders, allRiders, plans, care, loggers] = await Promise.all([
    familyNames(),
    listHorseRiders(id),
    listAssignableRiders(),
    listFeedPlans(id),
    careOn ? listCareEvents(id) : Promise.resolve([]),
    careOn ? loggerNames() : Promise.resolve(new Map<string, string>()),
  ]);

  const assigned = new Set(riders.map((r) => r.id));
  const unassigned = allRiders.filter((r) => !assigned.has(r.id));
  const activePlans = plans.filter((p) => p.active);
  const retiredPlans = plans.filter((p) => !p.active);

  return (
    <TabPage title={horse.name}>
      <section className="flex flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4">
        <h2 className="text-base font-semibold">Details</h2>
        <HorseForm horse={horse} families={[...families].map(([fid, name]) => ({ id: fid, name }))} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold">Riders</h2>
          <p className="text-sm text-brand-ink/60">
            {riders.length === 0 ? "Nobody assigned" : `${riders.length} assigned`}
          </p>
        </div>

        {riders.map((rider) => (
          <div
            key={rider.id}
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-brand-ink/15 bg-white p-4"
          >
            <span className="min-w-0 flex-1 text-base font-medium">{rider.name}</span>
            <form action={unassignRider}>
              <input type="hidden" name="horse_id" value={horse.id} />
              <input type="hidden" name="rider_id" value={rider.id} />
              <button
                type="submit"
                className="min-h-11 rounded-xl border border-brand-ink/20 bg-white px-3 text-sm font-semibold"
              >
                Remove
              </button>
            </form>
          </div>
        ))}

        <div className="rounded-2xl border border-brand-ink/10 bg-white p-4">
          <AssignRiderForm
            horseId={horse.id}
            riders={unassigned.map((r) => ({ id: r.id, name: r.name }))}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold">Feed chart</h2>
          <p className="text-sm text-brand-ink/60">
            {activePlans.length === 0 ? "Not set up" : `${activePlans.length} meal(s)`}
          </p>
        </div>

        {activePlans.map((plan) => (
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
            <form action={retireFeedPlan} className="mt-3">
              <input type="hidden" name="id" value={plan.id} />
              <input type="hidden" name="horse_id" value={horse.id} />
              <button
                type="submit"
                className="min-h-11 w-full rounded-xl border border-brand-ink/20 bg-white text-sm font-semibold"
              >
                Retire this meal
              </button>
            </form>
          </div>
        ))}

        <div className="rounded-2xl border border-brand-ink/10 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-brand-ink/70">
            Set a meal
          </h3>
          <FeedPlanForm horseId={horse.id} current={activePlans} />
        </div>

        {retiredPlans.length > 0 && (
          <details className="rounded-2xl border border-brand-ink/10 bg-white p-4">
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">
              Previous feed charts ({retiredPlans.length})
            </summary>
            <ul className="mt-3 flex flex-col gap-2">
              {retiredPlans.map((plan) => (
                <li key={plan.id} className="text-sm text-brand-ink/70">
                  <span className="font-medium">{MEAL_LABELS[plan.meal]}:</span> {plan.description}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {careOn && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-semibold">Care history</h2>
            <p className="text-sm text-brand-ink/60">
              {care.length === 0 ? "Nothing logged" : `${care.length} record(s)`}
            </p>
          </div>

          <CareTimeline events={care} today={barnToday()} loggerNames={loggers} />

          <div className="rounded-2xl border border-brand-ink/10 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-brand-ink/70">Log care</h3>
            <CareLogForm horseId={horse.id} today={barnToday()} />
          </div>
        </section>
      )}

      <form action={deleteHorse}>
        <input type="hidden" name="id" value={horse.id} />
        <button
          type="submit"
          className="min-h-12 w-full rounded-xl border border-red-300 bg-white text-sm font-semibold text-red-700"
        >
          Delete {horse.name}
        </button>
      </form>

      <Link href="/manage/horses" className="py-2 text-center text-sm font-medium underline">
        Back to horses
      </Link>
    </TabPage>
  );
}
