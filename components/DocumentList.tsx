import { deleteHorseDocument } from "@/app/(app)/manage/horses/documents-actions";
import { formatBytes, type StoredDocument } from "@/lib/documents";

/**
 * The documents on a horse, as cards with a download and (for the barn) a
 * delete.
 *
 * There is no role branch deciding what to SHOW: the list itself arrives
 * already filtered by Storage RLS, so a family who may not read this horse's
 * folder is handed an empty array and sees the empty state. `canDelete` is the
 * only prop that varies, and it controls an action, not visibility.
 */
export function DocumentList({
  documents,
  horseId,
  canDelete = false,
  emptyMessage = "No documents yet.",
}: {
  documents: StoredDocument[];
  horseId: string;
  canDelete?: boolean;
  emptyMessage?: string;
}) {
  if (documents.length === 0) {
    return (
      <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {documents.map((doc) => (
        <li
          key={doc.path}
          className="flex min-h-16 items-center gap-3 rounded-2xl border border-brand-ink/15 bg-white p-4"
        >
          <span className="min-w-0 flex-1">
            {doc.url ? (
              <a
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                className="block break-words text-base font-semibold leading-snug underline"
              >
                {doc.name}
              </a>
            ) : (
              <span className="block break-words text-base font-semibold leading-snug">
                {doc.name}
              </span>
            )}
            {formatBytes(doc.sizeBytes) && (
              <span className="mt-0.5 block text-sm text-brand-ink/60">
                {formatBytes(doc.sizeBytes)}
              </span>
            )}
          </span>

          {canDelete && (
            <form action={deleteHorseDocument} className="shrink-0">
              <input type="hidden" name="horse_id" value={horseId} />
              <input type="hidden" name="path" value={doc.path} />
              <button
                type="submit"
                className="min-h-11 rounded-xl border border-red-300 bg-white px-3 text-sm font-semibold text-red-700"
              >
                Remove
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
