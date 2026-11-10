import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Tags (migration 0029): admin-managed named groups of people. Generic — a
 * course audience today ("people with tag X"), email audiences later.
 *
 * Every read runs on the viewer's own session; tags and memberships are
 * admin-only by RLS, so for anyone else these return nothing.
 */
export type TagSummary = { id: string; name: string; people: number; courses: { id: string; title: string }[] };
export type TagPerson = { profileId: string; name: string; role: "admin" | "staff" | "parent"; addedAt: string | null };

const ROLE_ORDER = { parent: 0, staff: 1, admin: 2 } as const;
const nameOf = (p: { full_name: string | null }) => p.full_name?.trim() || "Unnamed login";

export async function listTags(): Promise<TagSummary[]> {
  const supabase = await createClient();
  const [{ data: tags }, { data: links }, { data: courses }] = await Promise.all([
    supabase.from("tags").select("id, name").order("name"),
    supabase.from("profile_tags").select("tag_id"),
    supabase.from("learning_modules").select("id, title, audience_tag_id").not("audience_tag_id", "is", null),
  ]);
  return (tags ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    people: (links ?? []).filter((l) => l.tag_id === t.id).length,
    courses: (courses ?? []).filter((c) => c.audience_tag_id === t.id).map((c) => ({ id: c.id as string, title: c.title as string })),
  }));
}

/** One tag: who carries it, everyone who could be added, and the courses it opens. */
export async function loadTag(id: string): Promise<{
  tag: TagSummary;
  people: TagPerson[];
  others: TagPerson[];
} | null> {
  const supabase = await createClient();
  const [{ data: tag }, { data: links }, { data: profiles }, { data: courses }] = await Promise.all([
    supabase.from("tags").select("id, name").eq("id", id).maybeSingle(),
    supabase.from("profile_tags").select("profile_id, added_at").eq("tag_id", id),
    supabase.from("profiles").select("id, full_name, role"),
    supabase.from("learning_modules").select("id, title").eq("audience_tag_id", id).order("position"),
  ]);
  if (!tag) return null;
  const on = new Map((links ?? []).map((l) => [l.profile_id as string, (l.added_at as string) ?? null]));
  const all: TagPerson[] = (profiles ?? [])
    .map((p) => ({ profileId: p.id as string, name: nameOf(p), role: p.role as TagPerson["role"], addedAt: on.get(p.id as string) ?? null }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));
  return {
    tag: { id: tag.id as string, name: tag.name as string, people: on.size, courses: (courses ?? []).map((c) => ({ id: c.id as string, title: c.title as string })) },
    people: all.filter((p) => on.has(p.profileId)),
    others: all.filter((p) => !on.has(p.profileId)),
  };
}

/** Each login's tag names, for Team and access. */
export async function tagNamesByProfile(): Promise<Map<string, { id: string; name: string }[]>> {
  const supabase = await createClient();
  const [{ data: tags }, { data: links }] = await Promise.all([
    supabase.from("tags").select("id, name").order("name"),
    supabase.from("profile_tags").select("tag_id, profile_id"),
  ]);
  const byId = new Map((tags ?? []).map((t) => [t.id as string, t.name as string]));
  const out = new Map<string, { id: string; name: string }[]>();
  for (const l of links ?? []) {
    const name = byId.get(l.tag_id as string);
    if (!name) continue;
    const list = out.get(l.profile_id as string) ?? [];
    list.push({ id: l.tag_id as string, name });
    out.set(l.profile_id as string, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
