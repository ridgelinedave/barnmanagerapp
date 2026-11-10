"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentRole } from "@/lib/guard";

/**
 * Tags (migration 0029). Admin only — every write is refused by RLS for anyone
 * else; the role check turns that refusal into a sentence. Taking a person off
 * a tag hides what the tag opened at once and keeps their progress.
 */
export type TagState = { error: string | null; message: string | null };
const OK = (message: string): TagState => ({ error: null, message });
const FAIL = (error: string): TagState => ({ error, message: null });
const UUID = /^[0-9a-f-]{36}$/i;

function revalidateTags(id?: string) {
  revalidatePath("/manage/tags");
  if (id) revalidatePath(`/manage/tags/${id}`);
  revalidatePath("/manage/team");
}

const cleanName = (fd: FormData) => String(fd.get("name") ?? "").replace(/\s+/g, " ").trim();

export async function createTag(_prev: TagState, formData: FormData): Promise<TagState> {
  if ((await currentRole()) !== "admin") return FAIL("Only the barn admin can make tags.");
  const name = cleanName(formData);
  if (!name) return FAIL("Give the tag a name.");
  if (name.length > 80) return FAIL("Keep the name under 80 characters.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("tags").insert({ name }).select("id").single();
  if (error?.code === "23505") return FAIL(`There's already a tag called "${name}".`);
  if (error || !data) return FAIL("The tag wasn't saved. Try again.");
  revalidateTags();
  redirect(`/manage/tags/${data.id}`);
}

export async function renameTag(_prev: TagState, formData: FormData): Promise<TagState> {
  if ((await currentRole()) !== "admin") return FAIL("Only the barn admin can rename tags.");
  const id = String(formData.get("id") ?? "");
  const name = cleanName(formData);
  if (!UUID.test(id)) return FAIL("That tag could not be found.");
  if (!name) return FAIL("Give the tag a name.");
  if (name.length > 80) return FAIL("Keep the name under 80 characters.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("tags").update({ name }).eq("id", id).select("id");
  if (error?.code === "23505") return FAIL(`There's already a tag called "${name}".`);
  if (error || !data?.length) return FAIL("The new name wasn't saved. Try again.");
  revalidateTags(id);
  return OK("Renamed.");
}

/** Delete a tag no course uses. A course that uses it must be moved to another audience first. */
export async function deleteTag(formData: FormData): Promise<void> {
  if ((await currentRole()) !== "admin") return;
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { error } = await supabase.from("tags").delete().eq("id", id);
  if (error) return; // 23503: a course uses it — the page says so and offers no Delete
  revalidateTags();
  redirect("/manage/tags");
}

/** Put the chosen people on the tag. Already-tagged people are left as they are. */
export async function addToTag(_prev: TagState, formData: FormData): Promise<TagState> {
  if ((await currentRole()) !== "admin") return FAIL("Only the barn admin can tag people.");
  const tagId = String(formData.get("tag_id") ?? "");
  const ids = formData.getAll("profile_id").map(String).filter((v) => UUID.test(v));
  if (!UUID.test(tagId)) return FAIL("That tag could not be found.");
  if (ids.length === 0) return FAIL("Tick at least one person.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("profile_tags")
    .upsert(
      ids.map((profile_id) => ({ tag_id: tagId, profile_id })),
      { onConflict: "tag_id,profile_id", ignoreDuplicates: true },
    );
  if (error) return FAIL("They weren't added. Try again.");
  revalidateTags(tagId);
  return OK(ids.length === 1 ? "Added 1 person." : `Added ${ids.length} people.`);
}

/** Take one person off the tag. What it opened disappears for them; their progress stays. */
export async function removeFromTag(formData: FormData): Promise<void> {
  if ((await currentRole()) !== "admin") return;
  const tagId = String(formData.get("tag_id") ?? "");
  const profileId = String(formData.get("profile_id") ?? "");
  if (!UUID.test(tagId) || !UUID.test(profileId)) return;
  const supabase = await createClient();
  await supabase.from("profile_tags").delete().eq("tag_id", tagId).eq("profile_id", profileId);
  revalidateTags(tagId);
}
