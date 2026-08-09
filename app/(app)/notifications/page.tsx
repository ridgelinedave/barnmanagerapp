import { TabPage } from "@/components/TabPage";
import { Card, Chip, EmptyState } from "@/components/ui/primitives";
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
        <EmptyState
          title="Nothing waiting"
          body="Reminders, offers and barn news land here."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <Card
              as="li"
              key={item.id}
              className={`p-4 ${item.read_at ? "" : "border-gold/60"}`}
            >
              <div className="flex items-start gap-2">
                <h2 className="min-w-0 flex-1 font-display text-heading leading-snug text-ink">
                  {item.title}
                </h2>
                {/* Unread gets a chip as well as the border — the border alone
                    is a colour-only signal. */}
                {!item.read_at && <Chip value="New" icon="bell" tone="gold" />}
              </div>
              {item.body && <p className="mt-1 text-caption text-muted">{item.body}</p>}
            </Card>
          ))}
        </ul>
      )}
    </TabPage>
  );
}
