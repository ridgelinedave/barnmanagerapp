import { redirect } from "next/navigation";

/** Old address: Lessons is one tab with segments now, and this view opens it. */
export default function Page() {
  redirect("/lessons");
}
