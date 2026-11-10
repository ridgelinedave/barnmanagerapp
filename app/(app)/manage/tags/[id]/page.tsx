import Link from "next/link";
import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { ListRow, RowList } from "@/components/ui/ListRow";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/primitives";
import { SheetTrigger } from "@/components/ui/Sheet";
import { ConfirmDeleteForm } from "@/components/ConfirmDelete";
import { TagPeoplePicker } from "@/components/TagPeoplePicker";
import { RenameTagForm } from "@/components/TagForms";
import { requireTab } from "@/lib/guard";
import { loadTag } from "@/lib/tags";
import { deleteTag, removeFromTag } from "../actions";

export const metadata = { title: "Tags" };
export const dynamic = "force-dynamic";

const ROLE = { parent: "Client", staff: "Staff", admin: "Admin" } as const;

/**
 * One tag: the courses it opens, the people who have it (Remove takes it off —
 * what it opened disappears for them at once, their progress is kept), and
 * everyone else, to add. Staff and the admin see every published course
 * anyway; a tag decides it for clients.
 */
export default async function TagPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTab("/manage/tags");
  const { id } = await params;
  const loaded = await loadTag(id);
  if (!loaded) notFound();
  const { tag, people, others } = loaded;

  return (
    <TabPage
      title={tag.name}
      back="/manage/tags"
      layout="split"
      density="normal"
      detail={
        <section className="flex flex-col gap-3">
          <SectionHeader title="Add people" />
          <TagPeoplePicker tagId={tag.id} people={others} />
        </section>
      }
    >
      <section className="flex flex-col gap-3">
        <SectionHeader title="Opens" />
        {tag.courses.length === 0 ? (
          <p className="text-caption text-muted">No course uses this tag.</p>
        ) : (
          <RowList>
            {tag.courses.map((c) => (
              <ListRow key={c.id} href={`/lessons/learn/${c.id}`} title={c.title} />
            ))}
          </RowList>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="People" count={people.length ? `${people.length}` : undefined} />
        {people.length === 0 ? (
          <p className="text-caption text-muted">No one has this tag.</p>
        ) : (
          <RowList>
            {people.map((p) => (
              <ListRow
                key={p.profileId}
                title={p.name}
                meta={ROLE[p.role]}
                trailing={
                  <form action={removeFromTag}>
                    <input type="hidden" name="tag_id" value={tag.id} />
                    <input type="hidden" name="profile_id" value={p.profileId} />
                    <Button type="submit" size="sm" variant="ghost" arrow={false} className="max-lg:min-h-11">
                      Remove
                    </Button>
                  </form>
                }
              />
            ))}
          </RowList>
        )}
      </section>

      <section className="flex flex-col items-start gap-3 border-t border-rule pt-4">
        {/* In the body, not the header: on a phone the header is the barn's
            dark colour and a secondary button disappears into it. */}
        <SheetTrigger label="Rename" title={`Rename — ${tag.name}`}>
          <RenameTagForm id={tag.id} name={tag.name} />
        </SheetTrigger>
        {tag.courses.length > 0 ? (
          <p className="text-caption text-muted">
            A tag a course uses can&apos;t be deleted. Change{" "}
            {tag.courses.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <Link href={`/lessons/learn/${c.id}`} className="text-accent-text underline underline-offset-2">
                  {c.title}
                </Link>
              </span>
            ))}{" "}
            to another audience first.
          </p>
        ) : (
          <ConfirmDeleteForm
            action={deleteTag}
            fields={{ id: tag.id }}
            name={people.length ? `the tag "${tag.name}" (${people.length} ${people.length === 1 ? "person has" : "people have"} it)` : `the tag "${tag.name}"`}
          />
        )}
      </section>
    </TabPage>
  );
}
