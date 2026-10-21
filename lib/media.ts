import "server-only";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";

/**
 * Photos — horses, riders (photographs of CHILDREN), announcements.
 * Migration 0027: three PRIVATE buckets, object names '<owner id>/<file>',
 * and every read through a signed URL minted on the VIEWER's own session, so
 * the bucket policies decide who sees what. Nothing here uses the service
 * role, and nothing here stores a URL — a row stores the object name.
 *
 * The barn supplies the photographs. Nothing in this app sources, generates
 * or seeds an image.
 */
export const MEDIA_BUCKETS = {
  horse: "horse-photos",
  rider: "rider-photos",
  announcement: "announcement-images",
  /** 0028: Academy course covers; readable exactly when the course is. */
  cover: "learning-covers",
} as const;

export type MediaBucket = (typeof MEDIA_BUCKETS)[keyof typeof MEDIA_BUCKETS];

/** The client crops to a 1024px square well under this; the bucket caps at 6 MB. */
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const SIGNED_TTL_SECONDS = 60 * 60;

/** The file in a form field, or null when the field was left empty. */
export function photoFromForm(formData: FormData, field = "photo"): File | null {
  const file = formData.get(field);
  return file instanceof File && file.size > 0 ? file : null;
}

/** A sentence for a file that cannot be stored, or null when it can. */
export function photoProblem(file: File): string | null {
  if (file.size > MAX_PHOTO_BYTES) return "That photo is over 6 MB. Try a smaller one.";
  if (file.type && !PHOTO_TYPES.includes(file.type)) return "Photos need to be a JPEG, PNG, WebP or AVIF image.";
  return null;
}

/**
 * Upload a photo under its owner's folder, on the caller's session. A fresh
 * name every time, so a replaced photo never serves a stale cached copy.
 */
export async function uploadPhoto(
  bucket: MediaBucket,
  ownerId: string,
  file: File,
): Promise<{ path: string } | { error: string }> {
  const problem = photoProblem(file);
  if (problem) return { error: problem };

  const ext = file.type === "image/png" ? "png" : file.type === "image/avif" ? "avif" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${ownerId}/${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  return error ? { error: error.message } : { path };
}

/** Remove an object the caller may delete; a failure leaves an orphan, never a hole. */
export async function removePhoto(bucket: MediaBucket, path: string | null | undefined): Promise<void> {
  if (!path) return;
  const supabase = await createClient();
  await supabase.storage.from(bucket).remove([path]);
}

/**
 * Signed URLs for the paths this VIEWER may read. A path they may not read
 * comes back with no URL and is simply absent from the map — the caller shows
 * initials, which is the same thing it shows for "no photo".
 */
export async function signPhotos(
  bucket: MediaBucket,
  paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wanted = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (!supabaseConfigured() || wanted.length === 0) return out;

  const supabase = await createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrls(wanted, SIGNED_TTL_SECONDS);
  for (const row of data ?? []) if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  return out;
}

/** One signed URL, or null. */
export async function signPhoto(bucket: MediaBucket, path: string | null | undefined): Promise<string | null> {
  return path ? ((await signPhotos(bucket, [path])).get(path) ?? null) : null;
}

/**
 * Display URLs for a set of horses, by id.
 *
 * A row the viewer reads in full carries photo_path. A BASICS row (a horse
 * the viewer's rider rides but their family does not own — horses_basics())
 * does not, and widening that function is SQL. So for those, the horse's
 * folder is LISTED on the viewer's session: 0027's read policy already lets a
 * riding family read that horse's photo, and a horse folder only ever holds
 * the current photo (the previous one is removed on replace). Legacy
 * photo_url is the last fallback; a dead one shows initials (FaceImage).
 */
export async function horsePhotoUrls(
  horses: { id: string; photo_url?: string | null; photo_path?: string | null }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!supabaseConfigured() || horses.length === 0) return out;

  const supabase = await createClient();
  const paths = new Map<string, string>();
  const unknown = horses.filter((h) => !h.photo_path && !("photo_path" in h && h.photo_path === null));
  for (const h of horses) if (h.photo_path) paths.set(h.id, h.photo_path);

  await Promise.all(
    unknown.map(async (h) => {
      const { data } = await supabase.storage.from(MEDIA_BUCKETS.horse).list(h.id, { limit: 1, sortBy: { column: "created_at", order: "desc" } });
      const name = data?.find((f) => f.name && !f.name.startsWith("."))?.name;
      if (name) paths.set(h.id, `${h.id}/${name}`);
    }),
  );

  const signed = await signPhotos(MEDIA_BUCKETS.horse, [...paths.values()]);
  for (const h of horses) {
    const path = paths.get(h.id);
    const url = (path && signed.get(path)) || h.photo_url || null;
    if (url) out.set(h.id, url);
  }
  return out;
}

/** Display URLs for riders, by id: the 0027 photo, else the legacy URL. */
export async function riderPhotoUrls(
  riders: { id: string; photo_url?: string | null; photo_path?: string | null }[],
): Promise<Map<string, string>> {
  const signed = await signPhotos(MEDIA_BUCKETS.rider, riders.map((r) => r.photo_path));
  const out = new Map<string, string>();
  for (const r of riders) {
    const url = (r.photo_path && signed.get(r.photo_path)) || r.photo_url || null;
    if (url) out.set(r.id, url);
  }
  return out;
}

/** Signed image URLs for announcements, by id. The bucket policy follows each post's audience. */
export async function announcementImageUrls(
  announcements: { id: string; image_path?: string | null }[],
): Promise<Map<string, string>> {
  const signed = await signPhotos(MEDIA_BUCKETS.announcement, announcements.map((a) => a.image_path));
  const out = new Map<string, string>();
  for (const a of announcements) {
    const url = a.image_path ? signed.get(a.image_path) : undefined;
    if (url) out.set(a.id, url);
  }
  return out;
}
