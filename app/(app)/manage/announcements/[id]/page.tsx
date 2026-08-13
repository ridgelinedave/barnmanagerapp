import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { AnnouncementForm } from "@/components/AnnouncementForm";
import { Button } from "@/components/ui/Button";
import { requireTab } from "@/lib/guard";
import { getAnnouncement } from "@/lib/announcements";
import { deleteAnnouncement, updateAnnouncement } from "../actions";

export const metadata = { title: "Edit announcement" };

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireTab("/manage");

  const { id } = await params;
  const announcement = await getAnnouncement(id);
  if (!announcement) notFound();

  return (
    <TabPage title="Edit announcement" back="/manage/announcements">
      <AnnouncementForm
        action={updateAnnouncement}
        announcement={announcement}
        submitLabel="Save changes"
      />

      {/* Delete moved here from the list, where it sat under every notice as a
          red button a thumb-width from the headline. It is the last thing on
          the screen you already chose to open, which is the right amount of
          friction for something with no undo. */}
      <form action={deleteAnnouncement}>
        <input type="hidden" name="id" value={announcement.id} />
        <Button type="submit" variant="danger" block>
          Delete this announcement
        </Button>
      </form>
    </TabPage>
  );
}
