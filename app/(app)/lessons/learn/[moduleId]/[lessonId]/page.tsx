import Link from "next/link";
import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { VideoPlayer } from "@/components/VideoPlayer";
import { LearningNotesEditor } from "@/components/LearningNotesEditor";
import { SectionHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { requireTab } from "@/lib/guard";
import { formatDuration, loadModule } from "@/lib/learning";
import { resolveLessonPlayback } from "@/lib/video";
import { barn, featureEnabled } from "@/config/barn";

export const metadata = { title: barn.learning.label };

/** Playback is minted per viewer, per request — never cached and shared. */
export const dynamic = "force-dynamic";

/**
 * One lesson: the video, then the barn owner's notes.
 *
 * THE PRIVACY ORDER, which is the whole design (DESIGN-MASTER §8):
 *   1. `loadModule` reads the module and its lessons on the VIEWER'S OWN
 *      session. RLS — learning_audience_allows / learning_module_is_readable —
 *      returns nothing to a viewer outside the module's audience.
 *   2. No row: 404. Nothing below runs, and no Stream API call is made.
 *   3. Only for a lesson that came back from step 1 does the server mint a
 *      short-lived signed token (lib/video.ts → lib/stream.ts, server-only),
 *      and the page renders the player with it.
 * There is no route or action a browser can call to ask for a token, and a
 * video id alone plays nothing because every video requires signed URLs.
 */
export default async function LearningLessonPage({
  params,
}: {
  params: Promise<{ moduleId: string; lessonId: string }>;
}) {
  const role = await requireTab("/lessons");
  if (!featureEnabled("learning")) notFound();

  const { moduleId, lessonId } = await params;
  const loaded = await loadModule(moduleId);
  if (!loaded) notFound();

  const { module, lessons } = loaded;
  const index = lessons.findIndex((l) => l.id === lessonId);
  if (index < 0) notFound();
  const lesson = lessons[index];

  const playback = await resolveLessonPlayback(lesson);
  const previous = lessons[index - 1];
  const next = lessons[index + 1];
  const isAdmin = role === "admin";
  const duration = formatDuration(lesson.duration_seconds);

  return (
    <TabPage title={lesson.title} back={`/lessons/learn/${module.id}`} layout="wide" density="airy">
      <div className="flex flex-col gap-7 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-10">
        <div className="flex min-w-0 flex-col gap-5">
          <VideoPlayer playback={playback} title={lesson.title} />

          <p className="font-sans text-micro uppercase text-muted">
            {module.title} · Lesson {index + 1} of {lessons.length}
            {duration ? ` · ${duration}` : ""}
          </p>

          {/* NOTES. The barn owner writes these herself; nothing is generated
              or pre-filled. Empty notes show members nothing at all, and show
              the admin a clearly marked place to write them. */}
          {isAdmin ? (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Notes" />
              {!lesson.notes.trim() && (
                <p className="rounded-control border border-dashed border-muted/60 px-3 py-2 text-label text-muted">
                  No notes yet. Members see nothing here until there are.
                </p>
              )}
              <LearningNotesEditor lessonId={lesson.id} moduleId={module.id} notes={lesson.notes} />
            </section>
          ) : (
            lesson.notes.trim() && (
              <section className="flex flex-col gap-3">
                <SectionHeader title="Notes" />
                <p className="whitespace-pre-line text-body leading-relaxed text-ink">{lesson.notes}</p>
              </section>
            )
          )}
        </div>

        {/* The module's lessons beside the player on a desk, under it on a
            phone; the current one carries the nav accent and aria-current. */}
        <nav aria-label="Lessons in this module" className="flex flex-col gap-2">
          <SectionHeader title="In this module" />
          <ol className="flex flex-col">
            {lessons.map((item, i) => {
              const current = item.id === lesson.id;
              return (
                <li key={item.id}>
                  <Link
                    href={`/lessons/learn/${module.id}/${item.id}`}
                    aria-current={current ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-3 border-l-2 py-2 pl-3 pr-2 text-label lg:min-h-9 lg:text-table ${
                      current
                        ? "border-accent bg-accent-tint font-semibold text-ink"
                        : "border-transparent text-ink hover:bg-surface"
                    }`}
                  >
                    <span className="w-5 shrink-0 tabular-nums text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1">{item.title}</span>
                    {formatDuration(item.duration_seconds) && (
                      <span className="shrink-0 tabular-nums text-muted">{formatDuration(item.duration_seconds)}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>

          {(previous || next) && (
            <div className="mt-2 flex gap-2">
              {previous && (
                <Link
                  href={`/lessons/learn/${module.id}/${previous.id}`}
                  className="flex min-h-11 flex-1 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-label font-semibold text-ink lg:min-h-9 lg:text-table"
                >
                  <Icon name="back" className="size-4 shrink-0" strokeWidth={2} />
                  Previous
                </Link>
              )}
              {next && (
                <Link
                  href={`/lessons/learn/${module.id}/${next.id}`}
                  className="flex min-h-11 flex-1 items-center justify-end gap-1.5 rounded-control border border-line bg-surface px-3 text-label font-semibold text-ink lg:min-h-9 lg:text-table"
                >
                  Next
                  <Icon name="arrow" className="size-4 shrink-0" strokeWidth={2} />
                </Link>
              )}
            </div>
          )}
        </nav>
      </div>
    </TabPage>
  );
}
