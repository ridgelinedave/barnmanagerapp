"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { isAudience } from "@/lib/types";
import { featureEnabled } from "@/config/barn";
import { MEDIA_BUCKETS, photoFromForm, photoProblem, removePhoto, uploadPhoto } from "@/lib/media";

/** The image field, when photos are on. Checked before any write. */
function imageOf(formData: FormData): { file: File | null; problem: string | null } {
  const file = featureEnabled("media") ? photoFromForm(formData) : null;
  return { file, problem: file ? photoProblem(file) : null };
}

/**
 * Announcement writes.
 *
 * These run under the caller's own session, so the admin-only INSERT/UPDATE/
 * DELETE policies apply exactly as they would to a direct API call. The role
 * check below is a UX guard that returns a readable message — it is NOT the
 * security boundary. Deleting it would change the error text, not the outcome.
 *
 * The service-role client is deliberately not used here.
 */
export type ActionState = { error: string | null };

type AnnouncementInput = {
  title: string;
  body_md: string;
  pinned: boolean;
  notify: boolean;
  audience: string;
};

function parse(formData: FormData): AnnouncementInput | { error: string } {
  const title = String(formData.get("title") ?? "").trim();
  const body_md = String(formData.get("body_md") ?? "").trim();
  const audience = String(formData.get("audience") ?? "all");

  if (!title) return { error: "Give the announcement a title." };
  if (title.length > 200) return { error: "Titles need to be under 200 characters." };
  if (!isAudience(audience)) return { error: "Pick a valid audience." };

  return {
    title,
    body_md,
    audience,
    pinned: formData.get("pinned") === "on",
    notify: formData.get("notify") === "on",
  };
}

export async function createAnnouncement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parse(formData);
  if ("error" in parsed) return { error: parsed.error };

  const state = await getViewer();
  if (state.status !== "viewer" || state.viewer.role !== "admin") {
    return { error: "Only an admin can post announcements." };
  }

  const image = imageOf(formData);
  if (image.problem) return { error: image.problem };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .insert({
      ...parsed,
      author: state.viewer.profile?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // IMAGE AT CREATION, inline on the compose screen. The object can only be
  // written under an id that exists, so it follows the insert directly.
  if (image.file && data?.id) {
    const uploaded = await uploadPhoto(MEDIA_BUCKETS.announcement, data.id, image.file);
    if ("path" in uploaded) {
      await supabase.from("announcements").update({ image_path: uploaded.path }).eq("id", data.id);
    }
  }

  // Notifications were written by the database trigger inside the same
  // statement, so the bell is already accurate by the time these revalidate.
  revalidatePath("/manage/announcements");
  revalidatePath("/home");
  redirect("/manage/announcements");
}

export async function updateAnnouncement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing announcement id." };

  const parsed = parse(formData);
  if ("error" in parsed) return { error: parsed.error };

  const state = await getViewer();
  if (state.status !== "viewer" || state.viewer.role !== "admin") {
    return { error: "Only an admin can edit announcements." };
  }

  const image = imageOf(formData);
  if (image.problem) return { error: image.problem };

  const supabase = await createClient();
  let imagePath: string | undefined;
  let previous: string | null = null;
  if (image.file) {
    const { data: existing } = await supabase.from("announcements").select("image_path").eq("id", id).maybeSingle();
    previous = existing?.image_path ?? null;
    const uploaded = await uploadPhoto(MEDIA_BUCKETS.announcement, id, image.file);
    if ("error" in uploaded) return { error: uploaded.error };
    imagePath = uploaded.path;
  }

  const { error } = await supabase
    .from("announcements")
    .update(imagePath ? { ...parsed, image_path: imagePath } : parsed)
    .eq("id", id);

  if (error) {
    if (imagePath) await removePhoto(MEDIA_BUCKETS.announcement, imagePath);
    return { error: error.message };
  }
  if (imagePath && previous && previous !== imagePath) await removePhoto(MEDIA_BUCKETS.announcement, previous);

  revalidatePath("/manage/announcements");
  revalidatePath("/home");
  redirect("/manage/announcements");
}

export async function deleteAnnouncement(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const state = await getViewer();
  if (state.status !== "viewer" || state.viewer.role !== "admin") return;

  const supabase = await createClient();
  await supabase.from("announcements").delete().eq("id", id);

  revalidatePath("/manage/announcements");
  revalidatePath("/home");

  // Called from the edit screen now, not from a row on the list — so it has to
  // send you somewhere. Staying put would re-render a page whose announcement
  // no longer exists, which is a 404 as a reward for a successful delete.
  redirect("/manage/announcements");
}
