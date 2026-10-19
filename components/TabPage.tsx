import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import {
  DEFAULT_LAYOUT,
  DENSITY_GAP,
  bucketMainClass,
  type Density,
  type LayoutBucket,
} from "@/components/layout-buckets";

/**
 * The standard screen: a header, the body, room at the bottom for the fixed
 * tab bar on a phone.
 *
 * `layout` picks the desktop bucket (see components/layout-buckets.ts). Leave
 * it off and the screen is the capped reading column at every width.
 * `detail` is the second column of a `split` screen and is ignored otherwise.
 * `density` sets the rhythm between blocks — tight for a list, airy for a
 * record about one thing.
 *
 * `tabs` are the screen's sub-views (Day / Month / Agenda). On the desktop
 * shell they sit in the page header under the title; on a phone they open the
 * body, where the thumb is. One node, rendered in both places, one of them
 * `display: none` — so it is never read or tabbed to twice.
 */
export function TabPage({
  title,
  back,
  action,
  subject,
  layout = DEFAULT_LAYOUT,
  density = "normal",
  tabs,
  detail,
  children,
}: {
  title: string;
  back?: string;
  action?: ReactNode;
  subject?: { name: string; meta?: string; photoUrl?: string | null };
  layout?: LayoutBucket;
  density?: Density;
  tabs?: ReactNode;
  detail?: ReactNode;
  children: ReactNode;
}) {
  const gap = DENSITY_GAP[density];

  return (
    <>
      <AppHeader
        title={title}
        back={back}
        action={action}
        subject={subject}
        layout={layout}
        tabs={tabs}
      />
      <main id="main" className={bucketMainClass(layout)}>
        {layout === "split" ? (
          <div className={`flex flex-col ${gap} lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-8`}>
            <div className={`flex min-w-0 flex-col ${gap}`}>
              {tabs && <div className="lg:hidden">{tabs}</div>}
              {children}
            </div>
            {detail && <div className={`flex min-w-0 flex-col ${gap}`}>{detail}</div>}
          </div>
        ) : (
          <div className={`flex flex-col ${gap}`}>
            {tabs && <div className="lg:hidden">{tabs}</div>}
            {children}
          </div>
        )}
      </main>
    </>
  );
}
