import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { supabaseConfigured } from "@/lib/env";
import { MEDIA_BUCKETS, signPhotos } from "@/lib/media";
import { coursePercent } from "@/lib/academy-format";
import { streamVideoStatus } from "@/lib/stream";

/**
 * The Academy's reads (migration 0028: course > section > lesson).
 *
 * EVERY QUERY RUNS ON THE VIEWER'S OWN SESSION. Who sees which course,
 * section, lesson, category link, cover, enrolment and progress row is
 * decided by RLS (0023's audience rule, 0028's own-rows-only policies) —
 * never re-decided here. A draft course is simply not returned to a member.
 *
 * "Course" on screen is `learning_modules` in the schema (see 0028's header).
 */

export type Course = {
  id: string;
  title: string;
  description: string;
  position: number;
  published: boolean;
  audience: "all" | "level";
  audienceLevelId: string | null;
  coverPath: string | null;
};

export type CourseSection = { id: string; title: string; position: number };

export type CourseLesson = {
  id: string;
  sectionId: string;
  title: string;
  notes: string;
  position: number;
  videoId: string | null;
  videoProvider: string;
  durationSeconds: number | null;
};

export type CourseSummary = Course & {
  coverSrc: string | null;
  categoryIds: string[];
  lessonCount: number;
  completed: number;
  percent: number;
  enrolled: boolean;
  /** The next incomplete lesson in reading order; the first when all are done; null when there are none. */
  continueLessonId: string | null;
};

const COURSE_COLUMNS = "id, title, description, position, published, audience, audience_level_id, cover_path";

function toCourse(row: Record<string, unknown>): Course {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? "",
    position: row.position as number,
    published: Boolean(row.published),
    audience: row.audience as "all" | "level",
    audienceLevelId: (row.audience_level_id as string) ?? null,
    coverPath: (row.cover_path as string) ?? null,
  };
}

/** Lessons in READING order: section position, then lesson position. */
function readingOrder<T extends { sectionId: string; position: number }>(lessons: T[], sections: CourseSection[]): T[] {
  const rank = new Map(sections.map((s) => [s.id, s.position]));
  return [...lessons].sort((a, b) => (rank.get(a.sectionId) ?? 0) - (rank.get(b.sectionId) ?? 0) || a.position - b.position);
}

/** The next incomplete lesson, else the first (a finished course offers a rewatch). */
export function nextLessonId(ordered: { id: string }[], done: Set<string>): string | null {
  if (ordered.length === 0) return null;
  return (ordered.find((l) => !done.has(l.id)) ?? ordered[0]).id;
}

async function viewerProfileId(): Promise<string | null> {
  const state = await getViewer();
  return state.status === "viewer" ? (state.viewer.profile?.id ?? null) : null;
}

export async function listCategories(): Promise<{ id: string; name: string }[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("learning_categories").select("id, name, position").order("position").order("name");
  return (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string }));
}

/** Every course this viewer may see, with their own progress and a signed cover. */
export async function listCourses(): Promise<CourseSummary[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await createClient();
  const me = await viewerProfileId();

  const { data: rows } = await supabase.from("learning_modules").select(COURSE_COLUMNS).order("position");
  const courses = (rows ?? []).map(toCourse);
  if (courses.length === 0) return [];
  const ids = courses.map((c) => c.id);

  const [{ data: sections }, { data: lessons }, { data: links }, { data: enrolments }, { data: progress }, covers] =
    await Promise.all([
      supabase.from("learning_sections").select("id, module_id, title, position").in("module_id", ids),
      supabase.from("learning_lessons").select("id, module_id, section_id, position").in("module_id", ids),
      supabase.from("learning_module_categories").select("module_id, category_id").in("module_id", ids),
      me ? supabase.from("learning_enrolments").select("module_id").eq("profile_id", me).in("module_id", ids) : Promise.resolve({ data: [] }),
      me ? supabase.from("learning_progress").select("lesson_id").eq("profile_id", me) : Promise.resolve({ data: [] }),
      signPhotos(MEDIA_BUCKETS.cover, courses.map((c) => c.coverPath)),
    ]);

  const done = new Set((progress ?? []).map((p) => p.lesson_id as string));
  const enrolled = new Set((enrolments ?? []).map((e) => e.module_id as string));

  return courses.map((course) => {
    const own = (sections ?? [])
      .filter((s) => s.module_id === course.id)
      .map((s) => ({ id: s.id as string, title: s.title as string, position: s.position as number }));
    const ordered = readingOrder(
      (lessons ?? [])
        .filter((l) => l.module_id === course.id)
        .map((l) => ({ id: l.id as string, sectionId: l.section_id as string, position: l.position as number })),
      own,
    );
    const completed = ordered.filter((l) => done.has(l.id)).length;
    return {
      ...course,
      coverSrc: course.coverPath ? (covers.get(course.coverPath) ?? null) : null,
      categoryIds: (links ?? []).filter((l) => l.module_id === course.id).map((l) => l.category_id as string),
      lessonCount: ordered.length,
      completed,
      percent: coursePercent(completed, ordered.length),
      // Progress implies interest: a viewer who has completed a lesson counts
      // as enrolled for "My courses" even if the enrol row was never written.
      enrolled: enrolled.has(course.id) || completed > 0,
      continueLessonId: nextLessonId(ordered, done),
    };
  });
}

export type LoadedCourse = {
  course: CourseSummary;
  sections: CourseSection[];
  lessons: CourseLesson[];
  completedIds: Set<string>;
};

/** One course with its outline, for the course page and the player. */
export async function loadCourse(courseId: string): Promise<LoadedCourse | null> {
  if (!supabaseConfigured() || !/^[0-9a-f-]{36}$/i.test(courseId)) return null;
  const supabase = await createClient();
  const me = await viewerProfileId();

  const { data: row } = await supabase.from("learning_modules").select(COURSE_COLUMNS).eq("id", courseId).maybeSingle();
  if (!row) return null;
  const course = toCourse(row);

  const [{ data: sections }, { data: lessons }, { data: links }, { data: enrol }, covers] = await Promise.all([
    supabase.from("learning_sections").select("id, title, position").eq("module_id", courseId).order("position"),
    supabase
      .from("learning_lessons")
      .select("id, section_id, title, notes, position, video_provider, video_id, duration_seconds")
      .eq("module_id", courseId),
    supabase.from("learning_module_categories").select("category_id").eq("module_id", courseId),
    me
      ? supabase.from("learning_enrolments").select("id").eq("module_id", courseId).eq("profile_id", me).maybeSingle()
      : Promise.resolve({ data: null }),
    signPhotos(MEDIA_BUCKETS.cover, [course.coverPath]),
  ]);

  const outline = (sections ?? []).map((s) => ({ id: s.id as string, title: s.title as string, position: s.position as number }));
  const ordered = readingOrder(
    (lessons ?? []).map((l) => ({
      id: l.id as string,
      sectionId: l.section_id as string,
      title: l.title as string,
      notes: (l.notes as string) ?? "",
      position: l.position as number,
      videoId: (l.video_id as string) ?? null,
      videoProvider: l.video_provider as string,
      durationSeconds: (l.duration_seconds as number) ?? null,
    })),
    outline,
  );

  const ids = ordered.map((l) => l.id);
  const { data: progress } =
    me && ids.length
      ? await supabase.from("learning_progress").select("lesson_id").eq("profile_id", me).in("lesson_id", ids)
      : { data: [] };
  const completedIds = new Set((progress ?? []).map((p) => p.lesson_id as string));
  const completed = completedIds.size;

  return {
    course: {
      ...course,
      coverSrc: course.coverPath ? (covers.get(course.coverPath) ?? null) : null,
      categoryIds: (links ?? []).map((l) => l.category_id as string),
      lessonCount: ordered.length,
      completed,
      percent: coursePercent(completed, ordered.length),
      enrolled: Boolean(enrol) || completed > 0,
      continueLessonId: nextLessonId(ordered, completedIds),
    },
    sections: outline,
    lessons: ordered,
    completedIds,
  };
}

export type LearnerRow = { profileId: string; name: string; enrolledAt: string; completed: number; total: number; percent: number; lastCompletedAt: string | null };

/**
 * Admin: who is enrolled in this course and how far each has got (4.7).
 * Admin reads every enrolment and progress row (0028); anyone else gets only
 * their own rows back, so this is meaningful only for admin and the page
 * shows it only to admin.
 */
export async function courseLearners(courseId: string): Promise<LearnerRow[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await createClient();
  const [{ data: enrolments }, { data: lessons }] = await Promise.all([
    supabase.from("learning_enrolments").select("profile_id, created_at").eq("module_id", courseId),
    supabase.from("learning_lessons").select("id").eq("module_id", courseId),
  ]);
  const lessonIds = (lessons ?? []).map((l) => l.id as string);
  const { data: progress } = lessonIds.length
    ? await supabase.from("learning_progress").select("profile_id, lesson_id, completed_at").in("lesson_id", lessonIds)
    : { data: [] };

  const people = new Set<string>([
    ...(enrolments ?? []).map((e) => e.profile_id as string),
    ...(progress ?? []).map((p) => p.profile_id as string),
  ]);
  if (people.size === 0) return [];
  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", [...people]);
  const name = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string) || "Unnamed"]));

  return [...people]
    .map((id) => {
      const mine = (progress ?? []).filter((p) => p.profile_id === id);
      const last = mine.map((p) => p.completed_at as string).sort().at(-1) ?? null;
      const enrolledAt = ((enrolments ?? []).find((e) => e.profile_id === id)?.created_at as string) ?? last ?? "";
      return {
        profileId: id,
        name: name.get(id) ?? "Unnamed",
        enrolledAt,
        completed: mine.length,
        total: lessonIds.length,
        percent: coursePercent(mine.length, lessonIds.length),
        lastCompletedAt: last,
      };
    })
    .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
}

/**
 * Durations come from Stream once processing finishes. For the given lessons
 * that have a video and no duration yet, ask Stream and store the duration
 * when it is ready. No revalidation here — a page render may call this
 * (revalidatePath during render is refused); the server action that wraps it
 * revalidates.
 *
 * The write is on the viewer's session, so for anyone but an admin RLS makes
 * it a no-op; callers gate on admin anyway, to spare the Stream calls.
 */
export async function fillLessonDurations(lessonIds: string[]): Promise<{ pending: number; changed: boolean }> {
  if (lessonIds.length === 0) return { pending: 0, changed: false };
  const supabase = await createClient();
  const { data: lessons } = await supabase
    .from("learning_lessons")
    .select("id, video_id")
    .in("id", lessonIds)
    .is("duration_seconds", null)
    .not("video_id", "is", null);

  let pending = 0;
  let changed = false;
  await Promise.all(
    (lessons ?? []).map(async (lesson) => {
      try {
        const status = await streamVideoStatus(lesson.video_id as string);
        if (status.ready && status.durationSeconds) {
          await supabase.from("learning_lessons").update({ duration_seconds: status.durationSeconds }).eq("id", lesson.id);
          changed = true;
        } else {
          pending += 1;
        }
      } catch {
        pending += 1;
      }
    }),
  );
  return { pending, changed };
}
