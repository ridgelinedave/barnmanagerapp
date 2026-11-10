import { TabPage } from "@/components/TabPage";
import { ListRow, RowList } from "@/components/ui/ListRow";
import { EmptyState } from "@/components/ui/primitives";
import { NewTagForm } from "@/components/TagForms";
import { requireTab } from "@/lib/guard";
import { listTags } from "@/lib/tags";

export const metadata = { title: "Tags" };
export const dynamic = "force-dynamic";

/**
 * Tags — named groups of people the barn owner keeps (migration 0029). A
 * course can be limited to the people with one tag; later, email audiences
 * use the same tags. Admin only.
 */
export default async function TagsPage() {
  await requireTab("/manage/tags");
  const tags = await listTags();

  return (
    <TabPage title="Tags" back="/more" density="tight">
      <NewTagForm />
      {tags.length === 0 ? (
        <EmptyState title="No tags yet." />
      ) : (
        <RowList>
          {tags.map((t) => (
            <ListRow
              key={t.id}
              href={`/manage/tags/${t.id}`}
              title={t.name}
              meta={[
                `${t.people} ${t.people === 1 ? "person" : "people"}`,
                t.courses.length ? `Opens ${t.courses.map((c) => c.title).join(", ")}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ))}
        </RowList>
      )}
    </TabPage>
  );
}
