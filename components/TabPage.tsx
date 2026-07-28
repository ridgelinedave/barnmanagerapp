import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";

/**
 * Standard tab body: sticky header with the bell, scrollable content, and
 * bottom padding that clears the fixed tab bar.
 */
export function TabPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <AppHeader title={title} />
      <main className="mx-auto w-full max-w-screen-sm flex-1 px-4 pb-28 pt-4">
        <div className="flex flex-col gap-4">{children}</div>
      </main>
    </>
  );
}
