import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { Card, Chip, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { CheckedNowButton } from "@/components/BarnOpsForms";
import { isBarnSide, listWaterSources, sinceLabel, waterIsOverdue } from "@/lib/barn-ops";
import type { WaterSource } from "@/lib/types";

export const metadata = { title: "Water troughs" };

/**
 * Trough timers. Due-a-check first, because that is the only reason to open
 * this screen standing in a field.
 *
 * Barn-only: the policy has no parent branch at all, so a family reaching this
 * URL would get an empty list — and an empty list reads as "nothing to do"
 * rather than "not for you". It 404s for them instead.
 *
 * "Never checked" counts as overdue. A trough someone added and forgot is
 * exactly the one worth surfacing.
 */
function TroughCard({ source, overdue }: { source: WaterSource; overdue: boolean }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline gap-3">
        <h3 className="min-w-0 flex-1 font-display text-heading leading-snug text-ink">
          {source.name}
        </h3>
        {overdue && <Chip value="Due" icon="alert" tone="gold" />}
      </div>

      {source.location && <p className="text-caption text-muted">{source.location}</p>}
      {source.notes && <p className="text-caption text-muted">{source.notes}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-caption text-muted">
          {sinceLabel(source.last_checked_at)} · every{" "}
          {source.reminder_interval_days === 1
            ? "day"
            : `${source.reminder_interval_days} days`}
        </span>
        <CheckedNowButton id={source.id} />
      </div>
    </Card>
  );
}

export default async function WaterPage() {
  if (!(await isBarnSide())) notFound();

  const sources = await listWaterSources();

  if (sources.length === 0) {
    return (
      <TabPage title="Water troughs" back="/barn">
        <EmptyState
          title="No troughs set up"
          body="Once the barn owner adds a trough, its check timer appears here."
        />
      </TabPage>
    );
  }

  const overdue = sources.filter((s) => waterIsOverdue(s));
  const fine = sources.filter((s) => !waterIsOverdue(s));

  return (
    <TabPage title="Water troughs" back="/barn">
      {overdue.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Due a check" count={`${overdue.length}`} />
          {overdue.map((s) => (
            <TroughCard key={s.id} source={s} overdue />
          ))}
        </section>
      )}

      {fine.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Up to date" count={`${fine.length}`} />
          {fine.map((s) => (
            <TroughCard key={s.id} source={s} overdue={false} />
          ))}
        </section>
      )}
    </TabPage>
  );
}
