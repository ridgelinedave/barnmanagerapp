import { headers } from "next/headers";
import { TabPage } from "@/components/TabPage";
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
import { TABS_BY_ROLE } from "@/lib/nav";
import { barn, featureEnabled } from "@/config/barn";

export const metadata = { title: "Settings" };

/**
 * SETTINGS — the far-right tab.
 *
 * The tab is still labelled "More" in the bottom bar, deliberately: five fixed
 * labels are what people navigate by and renaming one moves the furniture. The
 * SCREEN is a settings hub, because "More" described where it sat rather than
 * what it held, and an admin looking for the place to invite an instructor had
 * no reason to open a drawer called More.
 *
 * The order is who-you-are, then what-you-run, then your things, then the app.
 * "Team & access" leads the admin block by name — that phrase is what someone
 * is scanning for when a new instructor starts.
 */

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

  // A role with no Schedule tab still needs a way to the calendar, which now
  // lives on that screen. Staff and admin have it in the bottom bar already.
  const hasScheduleTab = TABS_BY_ROLE[role].some((tab) => tab.href === "/schedule");

  const hasLinks =
    !hasScheduleTab ||
    (featureEnabled("clockIn") && role !== "parent") ||
    featureEnabled("horses") ||
    (featureEnabled("forms") && role === "parent");

  return (
    <TabPage title="Settings">
      {/* Who you are signed in as, first — this is the screen people come to
          when they are not sure. */}
      {(name || email) && (
        <Card className="flex items-center gap-3 p-4">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent font-display text-heading font-bold text-accent-on"
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

      {/*
       * Running the barn. Admin only, and Team & access leads it: adding a
       * person, changing what they can see and revoking a login are the three
       * things that are urgent when they come up, and none of them were
       * findable from a screen called More.
       */}
      {role === "admin" && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Barn admin" />
          <Row
            href="/manage/team"
            title="Team & access"
            meta="Invite someone, set roles and permissions, families and riders"
            icon="people"
          />
          {featureEnabled("clockIn") && (
            <Row
              href="/manage/timesheets"
              title="Clock-ins & timesheets"
              meta="Who's on the clock right now, hours and approvals"
              icon="clock"
            />
          )}
        </section>
      )}

      {hasLinks && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Your things" />
          {!hasScheduleTab && (
            <Row
              href="/schedule?view=month"
              title="Calendar"
              meta="Lessons, barn events and care due — the whole month"
              icon="calendar"
            />
          )}
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
