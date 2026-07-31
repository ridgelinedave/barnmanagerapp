import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { SendCareDigestButton } from "@/components/CareLogForm";
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
    <TabPage title="Care due">
      <p className="text-sm text-brand-ink/70">
        Everything falling due in the next {CARE_DUE_SOON_DAYS} days, soonest first.
      </p>

      {due.length === 0 ? (
        <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
          Nothing due in the next {CARE_DUE_SOON_DAYS} days.
        </p>
      ) : (
        <>
          {overdue.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-red-800">Overdue ({overdue.length})</h2>
              {overdue.map(({ event, horse }) => (
                <Link
                  key={event.id}
                  href={`/manage/horses/${horse.id}`}
                  className="flex min-h-16 items-center gap-3 rounded-2xl border border-red-300 bg-white p-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold leading-snug">{horse.name}</span>
                    <span className="mt-0.5 block text-sm text-brand-ink/70">
                      {CARE_TYPE_LABELS[event.type]} · due {formatBarnDayLabel(event.due_next!)}
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-brand-ink/40">
                    ›
                  </span>
                </Link>
              ))}
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">Coming up ({soon.length})</h2>
            {soon.map(({ event, horse }) => (
              <Link
                key={event.id}
                href={`/manage/horses/${horse.id}`}
                className="flex min-h-16 items-center gap-3 rounded-2xl border border-brand-ink/15 bg-white p-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold leading-snug">{horse.name}</span>
                  <span className="mt-0.5 block text-sm text-brand-ink/70">
                    {CARE_TYPE_LABELS[event.type]} · due {formatBarnDayLabel(event.due_next!)}
                  </span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-brand-ink/40">
                  ›
                </span>
              </Link>
            ))}
          </section>
        </>
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4">
        <h2 className="text-base font-semibold">Remind the barn</h2>
        <p className="text-sm text-brand-ink/70">
          Sends a notification for each item above. Safe to press twice — an item already sent
          is not sent again.
        </p>
        <SendCareDigestButton />
      </section>

      <Link href="/manage" className="py-2 text-center text-sm font-medium underline">
        Back to Manage
      </Link>
    </TabPage>
  );
}
