import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { LessonPlayerShell } from "@/components/academy/LessonPlayerShell";
import { LessonVideo } from "@/components/academy/LessonVideo";
import { CourseOutline } from "@/components/academy/CourseOutline";
import { LearningNotesEditor } from "@/components/LearningNotesEditor";
import { requireTab } from "@/lib/guard";
import { loadCourse } from "@/lib/academy";
import { resolveLessonPlayback } from "@/lib/video";
import { streamThumbnails } from "@/lib/stream";
import { barn, featureEnabled } from "@/config/barn";
import { setLessonComplete } from "../../course-actions";

export const metadata = { title: barn.learning.label };

/** Playback is minted per viewer, per request — never cached and shared. */
export const dynamic = "force-dynamic";

/**
 * One lesson. On the desk, TabPage layout="split": the video, its details
 * and the notes on the left; the course outline down the right with this
 * lesson marked. On a phone the same stack: video, details, then the list.
 *
 * THE PRIVACY ORDER, which is the whole design (DESIGN-MASTER §8):
 *   1. `loadCourse` reads the course, its sections and lessons on the
 *      VIEWER'S OWN session. RLS (0023's audience rule, 0028's
 *      learning_lesson_is_readable) returns nothing to a viewer outside the
 *      audience, and nothing of a draft to anyone but the admin.
 *   2. No row: 404. Nothing below runs, and no Stream API call is made.
 *   3. Only for a lesson that came back from step 1 does the server mint
 *      short-lived signed tokens (lib/video.ts, lib/stream.ts, server-only)
 *      for the player and the outline's thumbnails.
 * There is no route or action a browser can call to ask for a token, and a
 * video id alone plays nothing because every video requires signed URLs.
 *
 * Previous and Next walk the whole course in reading order, across sections.
 */
export default async function LearningLessonPage({
  params,
}: {
  params: Promise<{ moduleId: string; lessonId: string }>;
}) {
  const role = await requireTab("/lessons");
  if (!featureEnabled("learning")) notFound();

  const { moduleId, lessonId } = await params;
  const loaded = await loadCourse(moduleId);
  if (!loaded) notFound();

  const { course, sections, lessons, completedIds } = loaded;
  const index = lessons.findIndex((l) => l.id === lessonId);
  if (index < 0) notFound();
  const lesson = lessons[index];

  const [playback, thumbs] = await Promise.all([
    resolveLessonPlayback({ video_provider: lesson.videoProvider, video_id: lesson.videoId }),
    streamThumbnails(lessons.map((l) => l.videoId).filter((v): v is string => Boolean(v))),
  ]);

  const href = (id: string) => `/lessons/learn/${course.id}/${id}`;
  const previous = lessons[index - 1];
  const next = lessons[index + 1];
  const isAdmin = role === "admin";
  const completed = completedIds.has(lesson.id);

  const outline = sections.map((s) => ({
    id: s.id,
    title: s.title,
    lessons: lessons
      .filter((l) => l.sectionId === s.id)
      .map((l) => ({
        id: l.id,
        title: l.title,
        href: href(l.id),
        durationSeconds: l.durationSeconds,
        thumbnailSrc: l.videoId ? (thumbs.get(l.videoId) ?? null) : null,
        completed: completedIds.has(l.id),
        current: l.id === lesson.id,
        toggleAction: setLessonComplete,
      })),
  }));

  return (
    <TabPage
      title={course.title}
      back={`/lessons/learn/${course.id}`}
      layout="split"
      split="player"
      density="normal"
      detail={
        <nav aria-label={`Lessons in ${course.title}`}>
          <CourseOutline sections={outline.filter((s) => s.lessons.length > 0)} compact heading="Lessons" />
        </nav>
      }
    >
      <LessonPlayerShell
        key={lesson.id}
        lessonId={lesson.id}
        video={
          <LessonVideo
            playback={playback}
            title={lesson.title}
            lessonId={lesson.id}
            courseId={course.id}
            completed={completed}
            enrolled={course.enrolled}
          />
        }
        title={lesson.title}
        position={`Lesson ${index + 1} of ${lessons.length}`}
        durationSeconds={lesson.videoId ? lesson.durationSeconds : null}
        notes={lesson.notes}
        completed={completed}
        toggleAction={setLessonComplete}
        previousHref={previous ? href(previous.id) : null}
        nextHref={next ? href(next.id) : null}
        notesSlot={
          isAdmin ? (
            <section aria-labelledby={`notes-heading-${lesson.id}`} className="flex flex-col gap-3 border-t border-rule pt-4">
              <h3 id={`notes-heading-${lesson.id}`} className="font-display text-title text-ink">
                Notes
              </h3>
              <LearningNotesEditor
                lessonId={lesson.id}
                moduleId={course.id}
                notes={lesson.notes}
                labelledBy={`notes-heading-${lesson.id}`}
              />
            </section>
          ) : undefined
        }
      />
    </TabPage>
  );
}
