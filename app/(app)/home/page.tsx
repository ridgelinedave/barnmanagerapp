import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { InstallPrompt } from "@/components/InstallPrompt";
import { currentRole } from "@/lib/guard";
import { barn } from "@/config/barn";

export const metadata = { title: "Home" };

/** Home is the one tab all three roles share, with different content per role. */
const HOME_BY_ROLE = {
  parent: {
    heading: "Your barn at a glance",
    phase: "Phase 1",
    detail:
      "Announcements, your onboarding checklist, balance due, your next lesson, and open show polls land here.",
  },
  staff: {
    heading: "Today at the barn",
    phase: "Phase 1",
    detail: "Announcements, your shift, open task count, and your clock status land here.",
  },
  admin: {
    heading: "Barn dashboard",
    phase: "Phase 1",
    detail:
      "Who's clocked in, today's lessons, unassigned tasks, cancellations needing backfill, due-soon care, and onboarding stragglers land here.",
  },
} as const;

export default async function HomePage() {
  const role = await currentRole();
  const content = HOME_BY_ROLE[role];

  return (
    <TabPage title="Home">
      <p className="text-sm text-brand-ink/70">
        Signed in to {barn.name} as <span className="font-semibold capitalize">{role}</span>.
      </p>
      <InstallPrompt />
      <StubScreen heading={content.heading} phase={content.phase}>
        <p className="text-sm text-brand-ink/70">{content.detail}</p>
      </StubScreen>
    </TabPage>
  );
}
