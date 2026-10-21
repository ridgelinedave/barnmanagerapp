"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentRole } from "@/lib/guard";
import { MEDIA_BUCKETS, photoFromForm, photoProblem, removePhoto, uploadPhoto } from "@/lib/media";
import { streamDeleteVideo } from "@/lib/stream";

/**
 * Academy authoring (admin) and the member's own progress.
 *
 * Every write runs on the caller's own session: course, section, lesson,
 * category-link and cover writes are admin-only by RLS (0023 / 0028), and a
 * member's enrolment and progress rows are their own only, into courses the
 * audience rule lets them see (0028's WITH CHECK). The role checks here only
 * turn a refusal into a sentence.
 */
export type CourseState = { error: string | null; message: string | null };
const OK = (message: string): CourseState => ({ error: null, message });
const FAIL = (error: string): CourseState => ({ error, message: null });
const UUID = /^[0-9a-f-]{36}$/i;

async function isAdmin(): Promise<boolean> {
  return (await currentRole()) === "admin";
}

function revalidateCourse(courseId?: string) {
  revalidatePath("/lessons/learn");
  if (courseId) revalidatePath(`/lessons/learn/${courseId}`, "layout");
}

type CourseFields = {
  title: string;
  description: string;
  audience: "all" | "level";
  audience_level_id: string | null;
};

function courseFields(formData: FormData): CourseFields | string {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return "Give the course a title.";
  if (title.length > 200) return "Titles need to be under 200 characters.";
  const audience = String(formData.get("audience") ?? "all") === "level" ? "level" : "all";
  const level = String(formData.get("audience_level_id") ?? "");
  if (audience === "level" && !UUID.test(level)) return "Choose the level this course is for.";
  return {
    title,
    description: String(formData.get("description") ?? "").trim().slice(0, 5000),
    audience,
    audience_level_id: audience === "level" ? level : null,
  };
}

function categoriesFrom(formData: FormData): string[] {
  return formData
    .getAll("category_id")
    .map(String)
    .filter((id) => UUID.test(id));
}

async function setCategories(courseId: string, ids: string[]) {
  const supabase = await createClient();
  await supabase.from("learning_module_categories").delete().eq("module_id", courseId);
  if (ids.length) {
    await supabase.from("learning_module_categories").insert(ids.map((category_id) => ({ module_id: courseId, category_id })));
  }
}

/**
 * New course: title, description, 16:9 cover (cropped in the browser),
 * categories, audience — all in ONE form. Starts as a DRAFT (invisible to
 * members) with one section, titled with the course, so videos can be
 * dropped straight in.
 */
export async function createCourse(_prev: CourseState, formData: FormData): Promise<CourseState> {
  if (!(await isAdmin())) return FAIL("Only the barn admin can create courses.");
  const fields = courseFields(formData);
  if (typeof fields === "string") return FAIL(fields);
  const cover = photoFromForm(formData, "cover");
  const problem = cover ? photoProblem(cover) : null;
  if (problem) return FAIL(problem);

  const supabase = await createClient();
  const { data: last } = await supabase.from("learning_modules").select("position").order("position", { ascending: false }).limit(1);
  const { data: course, error } = await supabase
    .from("learning_modules")
    .insert({ ...fields, position: (last?.[0]?.position ?? -1) + 1, published: false })
    .select("id")
    .single();
  if (error || !course) return FAIL(error?.message ?? "The course was not created.");

  await supabase.from("learning_sections").insert({ module_id: course.id, title: fields.title, position: 0 });
  await setCategories(course.id, categoriesFrom(formData));
  if (cover) {
    const uploaded = await uploadPhoto(MEDIA_BUCKETS.cover, course.id, cover);
    if ("path" in uploaded) await supabase.from("learning_modules").update({ cover_path: uploaded.path }).eq("id", course.id);
  }

  revalidateCourse();
  redirect(`/lessons/learn/${course.id}`);
}

export async function updateCourse(_prev: CourseState, formData: FormData): Promise<CourseState> {
  if (!(await isAdmin())) return FAIL("Only the barn admin can edit courses.");
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return FAIL("That course could not be found.");
  const fields = courseFields(formData);
  if (typeof fields === "string") return FAIL(fields);
  const cover = photoFromForm(formData, "cover");
  const problem = cover ? photoProblem(cover) : null;
  if (problem) return FAIL(problem);

  const supabase = await createClient();
  const { data: existing } = await supabase.from("learning_modules").select("cover_path").eq("id", id).maybeSingle();
  if (!existing) return FAIL("That course could not be found.");

  let coverPath: string | undefined;
  if (cover) {
    const uploaded = await uploadPhoto(MEDIA_BUCKETS.cover, id, cover);
    if ("error" in uploaded) return FAIL(uploaded.error);
    coverPath = uploaded.path;
  }
  const { error } = await supabase
    .from("learning_modules")
    .update(coverPath ? { ...fields, cover_path: coverPath } : fields)
    .eq("id", id);
  if (error) return FAIL(error.message);
  if (coverPath && existing.cover_path && existing.cover_path !== coverPath) {
    await removePhoto(MEDIA_BUCKETS.cover, existing.cover_path);
  }
  await setCategories(id, categoriesFrom(formData));

  revalidateCourse(id);
  return OK("Saved.");
}

/** Draft <-> published. A draft is invisible to members (0023's audience rule). */
export async function setCoursePublished(formData: FormData): Promise<void> {
  if (!(await isAdmin())) return;
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("learning_modules").update({ published: formData.get("published") === "true" }).eq("id", id);
  revalidateCourse(id);
}

/* --- sections --------------------------------------------------------------- */

export async function createSection(_prev: CourseState, formData: FormData): Promise<CourseState> {
  if (!(await isAdmin())) return FAIL("Only the barn admin can add sections.");
  const courseId = String(formData.get("course_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!UUID.test(courseId)) return FAIL("That course could not be found.");
  if (!title) return FAIL("Give the section a title.");
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("learning_sections")
    .select("position")
    .eq("module_id", courseId)
    .order("position", { ascending: false })
    .limit(1);
  const { error } = await supabase
    .from("learning_sections")
    .insert({ module_id: courseId, title: title.slice(0, 200), position: (last?.[0]?.position ?? -1) + 1 });
  if (error) return FAIL(error.message);
  revalidateCourse(courseId);
  return OK("Section added.");
}

export async function renameSection(_prev: CourseState, formData: FormData): Promise<CourseState> {
  if (!(await isAdmin())) return FAIL("Only the barn admin can rename sections.");
  const id = String(formData.get("section_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!UUID.test(id) || !title) return FAIL("Give the section a title.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("learning_sections").update({ title: title.slice(0, 200) }).eq("id", id).select("module_id");
  if (error || !data?.length) return FAIL(error?.message ?? "Not saved.");
  revalidateCourse(data[0].module_id as string);
  return OK("Saved.");
}

/**
 * Delete a section AND its lessons (the screen names how many). Each
 * lesson's Stream video is deleted too, so the barn is not billed for video
 * nobody can reach.
 */
export async function deleteSection(formData: FormData): Promise<void> {
  if (!(await isAdmin())) return;
  const id = String(formData.get("section_id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { data: lessons } = await supabase.from("learning_lessons").select("video_id").eq("section_id", id);
  const { data } = await supabase.from("learning_sections").delete().eq("id", id).select("module_id");
  if (!data?.length) return;
  await Promise.all(
    (lessons ?? []).filter((l) => l.video_id).map((l) => streamDeleteVideo(l.video_id as string).catch(() => undefined)),
  );
  revalidateCourse(data[0].module_id as string);
}

/** The complete new section order (drag on the desk, in-row buttons on a phone). */
export async function reorderSections(courseId: string, sectionIds: string[]): Promise<{ error: string | null }> {
  if (!(await isAdmin())) return { error: "Only the barn admin can reorder sections." };
  if (!UUID.test(courseId) || !sectionIds.every((id) => UUID.test(id))) return { error: "That order could not be read." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("learning_reorder_sections", { module: courseId, section_ids: sectionIds });
  revalidateCourse(courseId);
  return { error: error?.message ?? null };
}

/* --- lessons ---------------------------------------------------------------- */

export async function renameLesson(_prev: CourseState, formData: FormData): Promise<CourseState> {
  if (!(await isAdmin())) return FAIL("Only the barn admin can rename lessons.");
  const id = String(formData.get("lesson_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!UUID.test(id) || !title) return FAIL("Give the lesson a title.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("learning_lessons").update({ title: title.slice(0, 200) }).eq("id", id).select("module_id");
  if (error || !data?.length) return FAIL(error?.message ?? "Not saved.");
  revalidateCourse(data[0].module_id as string);
  return OK("Saved.");
}

/** Delete a lesson and its Stream video. */
export async function deleteLesson(formData: FormData): Promise<void> {
  if (!(await isAdmin())) return;
  const id = String(formData.get("lesson_id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("learning_lessons").delete().eq("id", id).select("module_id, video_id");
  if (!data?.length) return;
  if (data[0].video_id) await streamDeleteVideo(data[0].video_id as string).catch(() => undefined);
  revalidateCourse(data[0].module_id as string);
}

/**
 * The complete new order of ONE section, which may pull lessons in from
 * another section of the same course (a drag across sections). The database
 * function refuses a partial list, a duplicate or a foreign lesson.
 */
export async function reorderSectionLessons(courseId: string, sectionId: string, lessonIds: string[]): Promise<{ error: string | null }> {
  if (!(await isAdmin())) return { error: "Only the barn admin can reorder lessons." };
  if (!UUID.test(sectionId) || !lessonIds.every((id) => UUID.test(id))) return { error: "That order could not be read." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("learning_reorder_section", { section: sectionId, lesson_ids: lessonIds });
  revalidateCourse(UUID.test(courseId) ? courseId : undefined);
  return { error: error?.message ?? null };
}

/* --- the member's own progress ------------------------------------------------ */

/** Enrol the viewer in a course (My courses). Their own row only (0028). */
export async function enrolInCourse(formData: FormData): Promise<void> {
  const id = String(formData.get("module_id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("learning_enrolments").upsert({ module_id: id }, { onConflict: "module_id,profile_id", ignoreDuplicates: true });
  revalidateCourse(id);
}

/**
 * Tick a lesson off, or un-tick it. `completed` is the NEW state. Writing a
 * completion also enrols (watching a course is wanting it in My courses).
 */
export async function setLessonComplete(formData: FormData): Promise<void> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  if (!UUID.test(lessonId)) return;
  const completed = formData.get("completed") === "true";
  const supabase = await createClient();
  const { data: lesson } = await supabase.from("learning_lessons").select("module_id").eq("id", lessonId).maybeSingle();
  if (!lesson) return;
  if (completed) {
    await supabase.from("learning_progress").upsert({ lesson_id: lessonId }, { onConflict: "lesson_id,profile_id", ignoreDuplicates: true });
    await supabase
      .from("learning_enrolments")
      .upsert({ module_id: lesson.module_id }, { onConflict: "module_id,profile_id", ignoreDuplicates: true });
  } else {
    const { data: me } = await supabase.rpc("current_profile");
    if (me) await supabase.from("learning_progress").delete().eq("lesson_id", lessonId).eq("profile_id", me);
  }
  revalidateCourse(lesson.module_id as string);
}
