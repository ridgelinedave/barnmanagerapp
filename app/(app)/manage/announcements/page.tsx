import { TabPage } from "@/components/TabPage";
import {
  AnnouncementFeed,
  AnnouncementFilterChips,
  filterAnnouncements,
  isAnnouncementFilter,
  type AnnouncementFilter,
} from "@/components/AnnouncementFeed";
import { EmptyState } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/Button";
import { requireTab } from "@/lib/guard";
import { listAnnouncements } from "@/lib/announcements";

export const metadata = { title: "Announcements" };

const EMPTY_BODY: Record<AnnouncementFilter, string> = {
  all: "Post something and families see it straight away.",
  pinned: "Pin a notice while it matters and it leads the feed for everyone.",
  families: "Nothing addressed to everyone yet.",
  staff: "Nothing staff-only yet. Staff-only notices never reach parents.",
};

/**
 * The announcements list.
 *
 * Editorial like the family-facing feed — the lead notice featured, the rest as
 * compact rows — so what Belle is composing looks like what she is composing
 * it into. Filter chips scroll across the top.
 *
 * A row opens the editor rather than carrying Edit and Delete buttons of its
 * own. Two controls under every notice tripled the height of the list and put a
 * destructive action one thumb-slip from a headline; deleting now lives on the
 * edit screen, behind the tap that says you meant to work on that notice.
 */
export default async function ManageAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireTab("/manage");

  const params = await searchParams;
  const filter: AnnouncementFilter = isAnnouncementFilter(params.filter) ? params.filter : "all";

  const announcements = await listAnnouncements(50);
  const shown = filterAnnouncements(announcements, filter);

  return (
    <TabPage title="Announcements" back="/barn">
      <AnnouncementFilterChips
        active={filter}
        hrefFor={(value) =>
          value === "all" ? "/manage/announcements" : `/manage/announcements?filter=${value}`
        }
      />

      <ButtonLink href="/manage/announcements/new" variant="primary" block icon="plus">
        New announcement
      </ButtonLink>

      {shown.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "Nothing posted yet" : "Nothing here"}
          body={EMPTY_BODY[filter]}
        />
      ) : (
        <AnnouncementFeed
          announcements={shown}
          showAudience
          hrefFor={(id) => `/manage/announcements/${id}`}
        />
      )}
    </TabPage>
  );
}
