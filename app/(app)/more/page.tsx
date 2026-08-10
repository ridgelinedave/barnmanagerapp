import { headers } from "next/headers";
import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { PoweredByMonarch } from "@/components/Wordmark";
import { InstallPrompt } from "@/components/InstallPrompt";
import { CalendarSubscribe } from "@/components/CalendarSubscribe";
import { Card, FactList, SectionHeader } from "@/components/ui/primitives";
import { ListRow } from "@/components/ui/ListRow";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
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
  const protocol =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

const STILL_TO_COME = {
  parent: "Family profile and riders, FAQ, resources and notification preferences",
  staff: "The FAQ and your notification preferences",
  admin: "Barn settings, QuickBooks connection and CSV utilities",
} as const;

function Row({ href, title, meta, icon }: { href: string; title: string; meta: string; icon: IconName }) {
  return (
    <ListRow
      href={href}
      title={title}
      meta={meta}
      leading={
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-sunk text-accent-text">
          <Icon name={icon} className="size-5" />
        </span>
      }
    />
  );
}

export default async function MorePage() {
  const role = await currentRole();

  // The subscription link needs a profile to hang the token on. A dev-role
  // viewer has none, so the block simply does not render for them.
  const state = await getViewer();
  const profileId = state.status === "viewer" ? state.viewer.profile?.id : undefined;
  const email = state.status === "viewer" ? state.viewer.email : null;
  const name = state.status === "viewer" ? state.viewer.profile?.full_name : null;

  const calendarUrl =
    featureEnabled("events") && profileId
      ? await (async () => {
          const token = await myCalendarToken(profileId);
          return token ? `${await baseUrl()}/api/ical/${token}.ics` : null;
        })()
      : null;

  const hasLinks =
    (featureEnabled("clockIn") && role !== "parent") ||
    featureEnabled("horses") ||
    (featureEnabled("forms") && role === "parent");

  return (
    <TabPage title="More">
      {/* Who you are signed in as, first — this is the screen people come to
          when they are not sure. */}
      {(name || email) && (
        <Card className="flex items-center gap-3 p-4">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent font-display text-heading font-bold text-ink"
          >
            {(name ?? email ?? "?").trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-heading text-ink">{name ?? "Your account"}</span>
            <span className="block truncate text-caption text-muted">
              {email} · <span className="capitalize">{role}</span>
            </span>
          </span>
        </Card>
      )}

      {hasLinks && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Your things" />
          {featureEnabled("clockIn") && role !== "parent" && (
            <Row
              href="/more/timesheet"
              title="My timesheet"
              meta="Your punches and approved hours"
              icon="clock"
            />
          )}
          {featureEnabled("horses") && (
            <Row
              href="/more/horses"
              title={role === "parent" ? "Your horses" : "Horse directory"}
              meta={
                role === "parent"
                  ? "Your horse's record and feed chart"
                  : "Every horse at the barn, and what they're fed"
              }
              icon="horse"
            />
          )}
          {featureEnabled("forms") && role === "parent" && (
            <Row
              href="/more/forms"
              title="Forms"
              meta="Barn paperwork — fill in and sign on your phone"
              icon="document"
            />
          )}
        </section>
      )}

      {calendarUrl && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Your calendar" />
          <Card className="flex flex-col gap-3 p-4">
            <p className="text-caption text-muted">
              {role === "parent"
                ? "Your riders' lessons and barn events, in your phone's calendar app."
                : "Every lesson and barn event, in your phone's calendar app."}
            </p>
            <CalendarSubscribe url={calendarUrl} />
          </Card>
        </section>
      )}

      <InstallPrompt />

      <section className="flex flex-col gap-3">
        <SectionHeader title="The barn" />
        <Card className="p-4">
          <FactList
            facts={[
              ["Name", barn.name],
              ["Owner", barn.owner],
              ["Where", barn.area],
              ["Timezone", barn.timezone],
            ]}
          />
        </Card>
      </section>

      <StubScreen heading="Still to come" phase="Phases 2–3" detail={STILL_TO_COME[role]} />

      <form action="/auth/sign-out" method="post">
        <Button type="submit" block variant="secondary">
          Sign out
        </Button>
      </form>

      {/* The product signature, at the edge where it belongs. Inside a barn's
          app the barn's brand leads — their crest, their accent — and Monarch
          is the maker's mark on the underside, not a second logo. */}
      <PoweredByMonarch className="pt-1" />
    </TabPage>
  );
}
