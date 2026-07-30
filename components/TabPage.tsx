import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";

/**
 * The standard screen: charcoal header, cream body, room at the bottom for the
 * fixed tab bar.
 *
 * `gap-5` between blocks rather than a tighter uniform gap — sections need to
 * read as separate things on a small screen, and the rhythm is what stops a
 * column of cards looking like a spreadsheet.
 */
export function TabPage({
  title,
  back,
  action,
  subject,
  children,
}: {
  title: string;
  back?: string;
  action?: ReactNode;
  subject?: { name: string; meta?: string; photoUrl?: string | null };
  children: ReactNode;
}) {
  return (
    <>
      <AppHeader title={title} back={back} action={action} subject={subject} />
      {/* pb-28 clears the 56px tab bar plus the home indicator. */}
      <main className="mx-auto w-full max-w-screen-sm flex-1 px-4 pb-28 pt-5">
        <div className="flex flex-col gap-5">{children}</div>
      </main>
    </>
  );
}
