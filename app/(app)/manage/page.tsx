import { permanentRedirect } from "next/navigation";

/**
 * The Manage tab is gone; its contents are split by subject.
 *
 * Barn operations and horses are under /barn, teaching and shows under
 * /lessons, access under /more. The sub-paths (/manage/horses, /manage/care,
 * …) are UNCHANGED and still admin-gated — only the index and the tab were
 * removed — so nothing under here 404s.
 *
 * /barn is the closest thing to what this page was, so that is where a
 * bookmark lands.
 */
export default function ManageRedirect() {
  permanentRedirect("/barn");
}
