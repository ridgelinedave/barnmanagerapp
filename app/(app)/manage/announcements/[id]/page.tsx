import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { AnnouncementForm } from "@/components/AnnouncementForm";
import { requireTab } from "@/lib/guard";
import { getAnnouncement } from "@/lib/announcements";
import { updateAnnouncement } from "../actions";

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
    </TabPage>
  );
}
