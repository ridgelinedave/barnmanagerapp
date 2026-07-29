import { headers } from "next/headers";
import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { InstallPrompt } from "@/components/InstallPrompt";
import { CalendarSubscribe } from "@/components/CalendarSubscribe";
import { currentRole } from "@/lib/guard";
import { getViewer } from "@/lib/session";
import { myCalendarToken } from "@/lib/events";
import { barn, featureEnabled } from "@/config/barn";

export const metadata = { title: "More" };

/**
 * The absolute base URL, taken from the request.
 *
 * A calendar subscription URL has to be absolute — the client fetching it is
 * Google, not the browser — and there is no configured host yet, so it is read
 * from the request rather than invented.
 */
async function baseUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

const MORE_BY_ROLE = {
  parent: "Family profile and riders, forms and documents, FAQ, resources, shop, and notification preferences land here.",
  staff: "Your timesheet history, the horse directory, and FAQ land here.",
  admin:
    "Barn settings, QuickBooks connection status, notification preferences, and CSV utilities land here.",
} as const;

export default async function MorePage() {
  const role = await currentRole();

  // The subscription link needs a profile to hang the token on. A dev-role
  // viewer has none, so the block simply does not render for them.
  const state = await getViewer();
  const profileId = state.status === "viewer" ? state.viewer.profile?.id : undefined;
  const calendarUrl =
    featureEnabled("events") && profileId
      ? await (async () => {
          const token = await myCalendarToken(profileId);
          return token ? `${await baseUrl()}/api/ical/${token}.ics` : null;
        })()
      : null;

  return (
    <TabPage title="More">
      <StubScreen heading="More" phase="Phases 1–3">
        <p className="text-sm text-brand-ink/70">{MORE_BY_ROLE[role]}</p>
      </StubScreen>

      {featureEnabled("clockIn") && role !== "parent" && (
        <Link
          href="/more/timesheet"
          className="flex min-h-16 items-center gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4"
        >
          <span className="flex-1">
            <span className="block text-base font-semibold">My timesheet</span>
            <span className="block text-sm text-brand-ink/60">
              Your punches and approved hours.
            </span>
          </span>
          <span aria-hidden="true" className="text-brand-ink/40">
            ›
          </span>
        </Link>
      )}

      {featureEnabled("horses") && (
        <Link
          href="/more/horses"
          className="flex min-h-16 items-center gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4"
        >
          <span className="flex-1">
            <span className="block text-base font-semibold">
              {role === "parent" ? "Your horses" : "Horse directory"}
            </span>
            <span className="block text-sm text-brand-ink/60">
              {role === "parent"
                ? "Your horse's record and feed chart."
                : "Every horse at the barn, and what they're fed."}
            </span>
          </span>
          <span aria-hidden="true" className="text-brand-ink/40">
            ›
          </span>
        </Link>
      )}

      {featureEnabled("forms") && role === "parent" && (
        <Link
          href="/more/forms"
          className="flex min-h-16 items-center gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4"
        >
          <span className="flex-1">
            <span className="block text-base font-semibold">Forms</span>
            <span className="block text-sm text-brand-ink/60">
              Barn paperwork — fill in and sign on your phone.
            </span>
          </span>
          <span aria-hidden="true" className="text-brand-ink/40">
            ›
          </span>
        </Link>
      )}

      {calendarUrl && (
        <section className="flex flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4">
          <h2 className="text-base font-semibold">Subscribe to your calendar</h2>
          <p className="text-sm text-brand-ink/70">
            {role === "parent"
              ? "Your riders' lessons and barn events, in your phone's calendar app."
              : "Every lesson and barn event, in your phone's calendar app."}
          </p>
          <CalendarSubscribe url={calendarUrl} />
        </section>
      )}

      <InstallPrompt />

      <section className="rounded-2xl border border-brand-ink/10 bg-white p-4">
        <h2 className="text-base font-semibold">Barn</h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-brand-ink/60">Name</dt>
          <dd>{barn.name}</dd>
          <dt className="text-brand-ink/60">Owner</dt>
          <dd>{barn.owner}</dd>
          <dt className="text-brand-ink/60">Area</dt>
          <dd>{barn.area}</dd>
          <dt className="text-brand-ink/60">Timezone</dt>
          <dd>{barn.timezone}</dd>
        </dl>
      </section>

      <form action="/auth/sign-out" method="post">
        <button
          type="submit"
          className="min-h-12 w-full rounded-xl border border-brand-ink/20 bg-white px-4 text-sm font-semibold"
        >
          Sign out
        </button>
      </form>
    </TabPage>
  );
}
