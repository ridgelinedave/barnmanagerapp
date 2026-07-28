import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { AnnouncementCard } from "@/components/AnnouncementCard";
import { requireTab } from "@/lib/guard";
import { listAnnouncements } from "@/lib/announcements";
import { deleteAnnouncement } from "./actions";

export const metadata = { title: "Announcements" };

export default async function ManageAnnouncementsPage() {
  await requireTab("/manage");
  const announcements = await listAnnouncements(50);

  return (
    <TabPage title="Announcements">
      <Link
        href="/manage/announcements/new"
        className="flex min-h-12 items-center justify-center rounded-xl bg-brand-gold px-4 text-base font-semibold text-brand-ink"
      >
        New announcement
      </Link>

      {announcements.length === 0 ? (
        <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
          Nothing posted yet.
        </p>
      ) : (
        announcements.map((announcement) => (
          <div key={announcement.id} className="flex flex-col gap-2">
            <AnnouncementCard announcement={announcement} showAudience />
            <div className="flex gap-2">
              <Link
                href={`/manage/announcements/${announcement.id}`}
                className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-brand-ink/20 bg-white text-sm font-semibold"
              >
                Edit
              </Link>
              <form action={deleteAnnouncement}>
                <input type="hidden" name="id" value={announcement.id} />
                <button
                  type="submit"
                  className="min-h-11 rounded-xl border border-red-300 bg-white px-4 text-sm font-semibold text-red-700"
                >
                  Delete
                </button>
              </form>
            </div>
          </div>
        ))
      )}

      <Link href="/manage" className="py-2 text-center text-sm font-medium underline">
        Back to Manage
      </Link>
    </TabPage>
  );
}
