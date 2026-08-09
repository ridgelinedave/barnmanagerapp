import { TabPage } from "@/components/TabPage";
import { AnnouncementCard } from "@/components/AnnouncementCard";
import { EmptyState } from "@/components/ui/primitives";
import { Button, ButtonLink } from "@/components/ui/Button";
import { requireTab } from "@/lib/guard";
import { listAnnouncements } from "@/lib/announcements";
import { deleteAnnouncement } from "./actions";

export const metadata = { title: "Announcements" };

export default async function ManageAnnouncementsPage() {
  await requireTab("/manage");
  const announcements = await listAnnouncements(50);

  return (
    <TabPage title="Announcements" back="/manage">
      <ButtonLink href="/manage/announcements/new" variant="primary" block icon="plus">
        New announcement
      </ButtonLink>

      {announcements.length === 0 ? (
        <EmptyState
          title="Nothing posted yet"
          body="Post something and families see it straight away."
        />
      ) : (
        announcements.map((announcement) => (
          <div key={announcement.id} className="flex flex-col gap-2">
            <AnnouncementCard announcement={announcement} showAudience />
            <div className="flex gap-2">
              <ButtonLink
                href={`/manage/announcements/${announcement.id}`}
                variant="secondary"
                className="flex-1"
              >
                Edit
              </ButtonLink>
              <form action={deleteAnnouncement}>
                <input type="hidden" name="id" value={announcement.id} />
                <Button type="submit" variant="danger">
                  Delete
                </Button>
              </form>
            </div>
          </div>
        ))
      )}
    </TabPage>
  );
}
