import { TabPage } from "@/components/TabPage";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import { currentRole } from "@/lib/guard";
import type { Notification } from "@/lib/types";

export const metadata = { title: "Notifications" };

/**
 * The bell's destination. Not a tab — it hangs off the header on every screen.
 * RLS scopes the query to the caller's own rows, so there is no filter here.
 */
export default async function NotificationsPage() {
  await currentRole();

  let items: Notification[] = [];

  if (supabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    items = data ?? [];
  }

  return (
    <TabPage title="Notifications">
      {items.length === 0 ? (
        <p className="rounded-2xl border border-brand-ink/10 bg-white p-5 text-sm text-brand-ink/70">
          No notifications yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className={`rounded-2xl border bg-white p-4 ${
                item.read_at ? "border-brand-ink/10" : "border-brand-gold/60"
              }`}
            >
              <h2 className="text-sm font-semibold">{item.title}</h2>
              {item.body && <p className="mt-1 text-sm text-brand-ink/70">{item.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </TabPage>
  );
}
