import "server-only";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";

/**
 * The documents vault.
 *
 * The bucket is PRIVATE, so there is no URL that serves a file without a
 * session. Every link this module hands out is a short-lived signed URL minted
 * with the caller's own session — which means Storage RLS decides whether the
 * link can be minted at all. A family who may not read a document does not get
 * a broken link; they get no link, because the listing they are working from
 * was already filtered by the same policy.
 *
 * PATH CONVENTION IS THE SECURITY BOUNDARY (see migration 0012):
 *   horse_<uuid>/<filename>     documents about a horse
 *   family_<uuid>/<filename>    documents about a family
 * Build paths ONLY through the helpers here, so the shape the policies parse
 * and the shape the app writes cannot drift apart.
 */
export const DOCUMENTS_BUCKET = "documents";

/** Minutes a download link stays valid. Long enough to tap, short enough to expire. */
const SIGNED_URL_TTL_SECONDS = 60 * 30;

export function horseFolder(horseId: string): string {
  return `horse_${horseId}`;
}

export function familyFolder(familyId: string): string {
  return `family_${familyId}`;
}

/**
 * Strip anything that could change which folder a file lands in.
 *
 * A filename containing `../` or a slash would otherwise let an upload escape
 * its horse's folder — and the folder IS the access rule, so that would be a
 * privilege escalation dressed up as a filename.
 */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "document";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "document";
}

export type StoredDocument = {
  name: string;
  path: string;
  sizeBytes: number | null;
  updatedAt: string | null;
  /** Signed, short-lived. Null when a link could not be minted. */
  url: string | null;
};

/**
 * Documents for one horse, newest first, each with a signed download link.
 *
 * Returns an empty list rather than throwing when the caller may not see the
 * folder — which is what Storage RLS gives us, and what the screen should show.
 */
export async function listHorseDocuments(horseId: string): Promise<StoredDocument[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const folder = horseFolder(horseId);

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .list(folder, { sortBy: { column: "updated_at", order: "desc" } });

  if (error || !data?.length) return [];

  // Supabase returns a placeholder row for an empty folder; it has no id.
  const objects = data.filter((entry) => entry.id !== null);
  if (objects.length === 0) return [];

  const paths = objects.map((entry) => `${folder}/${entry.name}`);
  const { data: signed } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  const urlByPath = new Map((signed ?? []).map((s) => [s.path ?? "", s.signedUrl]));

  return objects.map((entry) => ({
    name: entry.name,
    path: `${folder}/${entry.name}`,
    sizeBytes: (entry.metadata?.size as number | undefined) ?? null,
    updatedAt: entry.updated_at ?? null,
    url: urlByPath.get(`${folder}/${entry.name}`) ?? null,
  }));
}

/** "1.4 MB". Null size renders as an empty string rather than "null". */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
