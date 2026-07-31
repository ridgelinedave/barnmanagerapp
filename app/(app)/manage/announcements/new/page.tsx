import { TabPage } from "@/components/TabPage";
import { AnnouncementForm } from "@/components/AnnouncementForm";
import { requireTab } from "@/lib/guard";
import { createAnnouncement } from "../actions";

export const metadata = { title: "New announcement" };

export default async function NewAnnouncementPage() {
  await requireTab("/manage");

  return (
    <TabPage title="New announcement" back="/manage/announcements">
      <AnnouncementForm action={createAnnouncement} submitLabel="Post" />
    </TabPage>
  );
}
