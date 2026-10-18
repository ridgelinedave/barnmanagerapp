import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { DEFAULT_LAYOUT, bucketMainClass, type LayoutBucket } from "@/components/layout-buckets";

/**
 * The standard screen: oxblood header, blush body, room at the bottom for the
 * fixed tab bar.
 *
 * `gap-5` between blocks rather than a tighter uniform gap — sections need to
 * read as separate things on a small screen, and the rhythm is what stops a
 * column of cards looking like a spreadsheet.
 *
 * `layout` picks the desktop bucket (see components/layout-buckets.ts). Leave
 * it off and the screen is today's capped reading column at every width.
 * `detail` is the second column of a `split` screen and is ignored otherwise.
 */
export function TabPage({
  title,
  back,
  action,
  subject,
  layout = DEFAULT_LAYOUT,
  detail,
  children,
}: {
  title: string;
  back?: string;
  action?: ReactNode;
  subject?: { name: string; meta?: string; photoUrl?: string | null };
  layout?: LayoutBucket;
  detail?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <AppHeader title={title} back={back} action={action} subject={subject} layout={layout} />
      <main className={bucketMainClass(layout)}>
        {layout === "split" ? (
          <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-8">
            <div className="flex min-w-0 flex-col gap-5">{children}</div>
            {detail && <div className="flex min-w-0 flex-col gap-5">{detail}</div>}
          </div>
        ) : (
          <div className="flex flex-col gap-5">{children}</div>
        )}
      </main>
    </>
  );
}
