import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { AnnouncementForm } from "@/components/AnnouncementForm";
import { ConfirmDeleteForm } from "@/components/ConfirmDelete";
import { MEDIA_BUCKETS, signPhoto } from "@/lib/media";
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
  const imageSrc = await signPhoto(MEDIA_BUCKETS.announcement, announcement.image_path);

  return (
    <TabPage title="Edit announcement" back="/manage/announcements">
      <AnnouncementForm
        action={updateAnnouncement}
        announcement={announcement}
        submitLabel="Save changes"
        imageSrc={imageSrc}
      />

      {/* Delete moved here from the list, where it sat under every notice as a
          red button a thumb-width from the headline. It is the last thing on
          the screen you already chose to open, which is the right amount of
          friction for something with no undo. */}
      <ConfirmDeleteForm action={deleteAnnouncement} fields={{ id: announcement.id }} name="this announcement" />
    </TabPage>
  );
}
