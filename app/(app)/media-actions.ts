"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { featureEnabled } from "@/config/barn";
import { MEDIA_BUCKETS, photoFromForm, removePhoto, uploadPhoto } from "@/lib/media";

/**
 * Replacing the photo on an EXISTING horse or rider. (A record being created
 * takes its photo in the create action itself — image at creation.)
 *
 * Every write runs on the caller's own session, so the bucket policies and,
 * for riders, set_rider_photo() are the real gate. The checks here only turn
 * a refusal into a sentence.
 */
export type PhotoState = { error: string | null; message: string | null };

const OFF: PhotoState = { error: "Photos are not switched on yet.", message: null };
const UUID = /^[0-9a-f-]{36}$/i;

/** Horses: admin, or the manage_horses flag. */
export async function uploadHorsePhoto(_prev: PhotoState, formData: FormData): Promise<PhotoState> {
  if (!featureEnabled("media")) return OFF;
  const state = await getViewer();
  const viewer = state.status === "viewer" ? state.viewer : null;
  if (!viewer || (viewer.role !== "admin" && !viewer.profile?.manage_horses)) {
    return { error: "You do not have permission to manage horses.", message: null };
  }

  const horseId = String(formData.get("horse_id") ?? "");
  const file = photoFromForm(formData);
  if (!UUID.test(horseId)) return { error: "Missing horse.", message: null };
  if (!file) return { error: "Choose a photo.", message: null };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("horses").select("photo_path").eq("id", horseId).maybeSingle();

  const uploaded = await uploadPhoto(MEDIA_BUCKETS.horse, horseId, file);
  if ("error" in uploaded) return { error: uploaded.error, message: null };

  const { data, error } = await supabase
    .from("horses")
    .update({ photo_path: uploaded.path })
    .eq("id", horseId)
    .select("id");
  if (error || !data?.length) {
    await removePhoto(MEDIA_BUCKETS.horse, uploaded.path);
    return { error: error?.message ?? "Not saved.", message: null };
  }
  // The old object goes only after the row points at the new one.
  if (existing?.photo_path && existing.photo_path !== uploaded.path) {
    await removePhoto(MEDIA_BUCKETS.horse, existing.photo_path);
  }

  for (const p of ["/manage/horses", "/more/horses", `/manage/horses/${horseId}`, `/more/horses/${horseId}`]) revalidatePath(p);
  return { error: null, message: "Photo saved." };
}

/**
 * Riders — PHOTOGRAPHS OF CHILDREN. The rider's own client, or admin.
 *
 * The path is recorded ONLY through set_rider_photo(), never by updating
 * riders directly: that function checks the caller owns the rider (or is
 * admin) AND that the path is under this rider's own folder, which is what
 * stops a client pointing their child's record at another child's photo.
 * A client cannot update riders at all, so there is no other way in.
 */
export async function uploadRiderPhoto(_prev: PhotoState, formData: FormData): Promise<PhotoState> {
  if (!featureEnabled("media")) return OFF;
  const riderId = String(formData.get("rider_id") ?? "");
  const file = photoFromForm(formData);
  if (!UUID.test(riderId)) return { error: "Missing rider.", message: null };
  if (!file) return { error: "Choose a photo.", message: null };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("riders").select("photo_path").eq("id", riderId).maybeSingle();
  if (!existing) return { error: "That rider could not be found.", message: null };

  const uploaded = await uploadPhoto(MEDIA_BUCKETS.rider, riderId, file);
  if ("error" in uploaded) {
    return { error: "Only the rider's own family or an admin can add this photo.", message: null };
  }

  const { error } = await supabase.rpc("set_rider_photo", { rider: riderId, path: uploaded.path });
  if (error) {
    await removePhoto(MEDIA_BUCKETS.rider, uploaded.path);
    return { error: error.message, message: null };
  }
  if (existing.photo_path && existing.photo_path !== uploaded.path) {
    await removePhoto(MEDIA_BUCKETS.rider, existing.photo_path);
  }

  revalidatePath("/more");
  revalidatePath("/manage/team");
  return { error: null, message: "Photo saved." };
}
