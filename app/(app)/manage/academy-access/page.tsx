import Link from "next/link";
import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { ListRow, RowList } from "@/components/ui/ListRow";
import { Button } from "@/components/ui/Button";
import { EmptyState, SectionHeader } from "@/components/ui/primitives";
import { SheetTrigger } from "@/components/ui/Sheet";
import { DataTable, DESKTOP_ONLY, MOBILE_ONLY, type Column, type Row } from "@/components/ui/DataTable";
import { GrantAccessForm } from "@/components/GrantAccessForm";
import { requireTab } from "@/lib/guard";
import { academyRoster } from "@/lib/academy-roster";
import { featureEnabled } from "@/config/barn";
import { endGrant } from "./actions";

export const metadata = { title: "Academy access" };
export const dynamic = "force-dynamic";

const long = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const until = (day: string | null) => (day ? `Until ${long(day)}` : "No end");

/**
 * Academy access (0032): who has it, why, and until when. Lesson students have
 * it while they take lessons (their lessons-end date ends it); anyone else by
 * a grant made here. Admin only.
 */
export default async function AcademyAccessPage() {
  await requireTab("/manage/academy-access");
  if (!featureEnabled("academyAccess")) notFound();
  const { rows, grants, studentsWithoutLogin, people } = await academyRoster();

  const columns: Column[] = [
    { key: "name", label: "Person" },
    { key: "why", label: "Why" },
    { key: "until", label: "Until" },
  ];
  const tableRows: Row[] = rows.map((r) => ({
    key: r.profileId,
    cells: { name: r.name, why: r.reasons.map((x) => x.label).join(" · "), until: until(r.lastDay) },
  }));
  const openGrants = grants.filter((g) => g.open);

  return (
    <TabPage
      title="Academy access"
      back="/more"
      layout="wide"
      density="normal"
      action={
        <SheetTrigger label="Grant access" title="Grant Academy access" variant="primary">
          <GrantAccessForm people={people} />
        </SheetTrigger>
      }
    >
      <section className="flex flex-col gap-3">
        <SectionHeader title="Who has it" count={`${rows.length}`} />
        {rows.length === 0 ? (
          <EmptyState title="No one yet." />
        ) : (
          <>
            <div className={MOBILE_ONLY}>
              <RowList>
                {rows.map((r) => (
                  <ListRow key={r.profileId} title={r.name} meta={`${r.reasons.map((x) => x.label).join(" · ")} · ${until(r.lastDay)}`} />
                ))}
              </RowList>
            </div>
            <div className={DESKTOP_ONLY}>
              <DataTable caption="Who has Academy access" columns={columns} rows={tableRows} />
            </div>
          </>
        )}
      </section>

      {studentsWithoutLogin.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Students without a login" count={`${studentsWithoutLogin.length}`} />
          <p className="text-caption text-ink">
            These students have the Academy, but no one on their family can sign in yet.{" "}
            <Link href="/manage/team" className="text-accent-text underline underline-offset-2">
              Invite them from Team and access.
            </Link>
          </p>
          <RowList>
            {studentsWithoutLogin.map((s) => (
              <ListRow key={s.riderId} title={s.riderName} meta={[s.familyName, until(s.lastDay)].filter(Boolean).join(" · ")} />
            ))}
          </RowList>
        </section>
      )}

      {openGrants.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Granted by hand" count={`${openGrants.length}`} />
          <RowList>
            {openGrants.map((g) => (
              <ListRow
                key={g.id}
                title={g.name}
                meta={[until(g.lastDay), g.note].filter(Boolean).join(" · ")}
                trailing={
                  <form action={endGrant}>
                    <input type="hidden" name="id" value={g.id} />
                    <Button type="submit" size="sm" variant="ghost" arrow={false} className="max-lg:min-h-11">
                      End now
                    </Button>
                  </form>
                }
              />
            ))}
          </RowList>
        </section>
      )}
    </TabPage>
  );
}
