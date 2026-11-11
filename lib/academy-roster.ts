import "server-only";

import { createClient } from "@/lib/supabase/server";
import { barn } from "@/config/barn";
import { lastZonedDay } from "@/lib/academy-access";

/**
 * Who has the Academy, why, and until when — the admin's list (0032).
 *
 * THE DATABASE DECIDES ACCESS (public.academy_access(), used by every Academy
 * row's RLS). This EXPLAINS it, by applying the same rule to the rows the
 * admin can read; tests/policies proves the two agree person by person. If
 * this ever disagreed with the database, the database would win — this page
 * cannot grant anything.
 *
 *   admin                full access
 *   grant                an academy_grants row with no end or an end ahead
 *   student (own login)  an active rider linked to the login, client not
 *                        inactive, lessons-end not passed
 *   student's family     same, for a rider with NO login of their own: every
 *                        client login on the rider's family
 */
export type AccessReason = { kind: "admin" | "grant" | "student" | "family"; label: string; endsAt: string | null };
export type AccessRow = {
  profileId: string;
  name: string;
  role: "admin" | "staff" | "parent";
  reasons: AccessReason[];
  /** The last day of access (barn time, YYYY-MM-DD), or null for no end. */
  lastDay: string | null;
};
export type GrantRow = { id: string; profileId: string; name: string; lastDay: string | null; note: string | null; open: boolean };
export type StudentNoLogin = { riderId: string; riderName: string; familyName: string; lastDay: string | null };

export async function academyRoster(now: Date = new Date()): Promise<{
  rows: AccessRow[];
  grants: GrantRow[];
  studentsWithoutLogin: StudentNoLogin[];
  people: { profileId: string; name: string; role: AccessRow["role"] }[];
}> {
  const supabase = await createClient();
  const [{ data: profiles }, { data: riders }, { data: families }, { data: grantRows }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, family_id"),
    supabase.from("riders").select("id, name, family_id, profile_id, active, lessons_end_at"),
    supabase.from("families").select("id, name, status"),
    supabase.from("academy_grants").select("id, profile_id, ends_at, note, created_at").order("created_at", { ascending: false }),
  ]);

  const nameOf = (p: { full_name: string | null }) => p.full_name?.trim() || "Unnamed login";
  const open = (endsAt: string | null) => endsAt === null || new Date(endsAt) > now;
  const familyById = new Map((families ?? []).map((f) => [f.id as string, f]));
  const people = (profiles ?? []).map((p) => ({ profileId: p.id as string, name: nameOf(p), role: p.role as AccessRow["role"], familyId: (p.family_id as string) ?? null }));

  const reasons = new Map<string, AccessReason[]>();
  const add = (profileId: string, r: AccessReason) => reasons.set(profileId, [...(reasons.get(profileId) ?? []), r]);

  for (const p of people) if (p.role === "admin") add(p.profileId, { kind: "admin", label: "Admin", endsAt: null });

  for (const g of grantRows ?? []) {
    if (open(g.ends_at as string | null)) add(g.profile_id as string, { kind: "grant", label: "Granted by hand", endsAt: (g.ends_at as string) ?? null });
  }

  const studentsWithoutLogin: StudentNoLogin[] = [];
  for (const r of riders ?? []) {
    const family = familyById.get(r.family_id as string);
    const current = r.active && family && family.status !== "inactive" && open((r.lessons_end_at as string) ?? null);
    if (!current) continue;
    const endsAt = (r.lessons_end_at as string) ?? null;
    if (r.profile_id) {
      add(r.profile_id as string, { kind: "student", label: `Student — ${r.name}`, endsAt });
    } else {
      const logins = people.filter((p) => p.role === "parent" && p.familyId === r.family_id);
      for (const l of logins) add(l.profileId, { kind: "family", label: `Family of student ${r.name}`, endsAt });
      if (logins.length === 0) {
        studentsWithoutLogin.push({
          riderId: r.id as string,
          riderName: r.name as string,
          familyName: (family?.name as string) ?? "",
          lastDay: endsAt ? lastZonedDay(endsAt, barn.timezone) : null,
        });
      }
    }
  }

  const rows: AccessRow[] = people
    .filter((p) => reasons.has(p.profileId))
    .map((p) => {
      const rs = reasons.get(p.profileId)!;
      // The latest end wins; any reason with no end means no end.
      const ends = rs.map((r) => r.endsAt);
      const lastEnd = ends.includes(null) ? null : ends.reduce((a, b) => (a! > b! ? a : b));
      return { profileId: p.profileId, name: p.name, role: p.role, reasons: rs, lastDay: lastEnd ? lastZonedDay(lastEnd, barn.timezone) : null };
    })
    .sort((a, b) => (a.role === "admin" ? 1 : 0) - (b.role === "admin" ? 1 : 0) || a.name.localeCompare(b.name));

  const nameById = new Map(people.map((p) => [p.profileId, p.name]));
  const grants: GrantRow[] = (grantRows ?? []).map((g) => ({
    id: g.id as string,
    profileId: g.profile_id as string,
    name: nameById.get(g.profile_id as string) ?? "Unnamed login",
    lastDay: g.ends_at ? lastZonedDay(g.ends_at as string, barn.timezone) : null,
    note: (g.note as string) ?? null,
    open: open((g.ends_at as string) ?? null),
  }));

  return {
    rows,
    grants,
    studentsWithoutLogin,
    people: people.filter((p) => p.role !== "admin").map(({ profileId, name, role }) => ({ profileId, name, role })),
  };
}
