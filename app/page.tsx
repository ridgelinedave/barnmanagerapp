import { redirect } from "next/navigation";

/** The app has no marketing surface — go straight to the shell. */
export default function RootPage() {
  redirect("/home");
}
