import { Button } from "@/components/ui/Button";
import { ROW, ROW_META, ROW_TITLE } from "@/components/ui/ListRow";
import { deleteHorseDocument } from "@/app/(app)/manage/horses/documents-actions";
import { formatBytes, type StoredDocument } from "@/lib/documents";

/**
 * The documents on a horse, as editorial rows (name in Marcellus, size in the
 * condensed face, a rule under each) with a download and, for the barn, a
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
      <p className="text-label text-muted">{emptyMessage}</p>
    );
  }

  return (
    <ul className="flex flex-col">
      {documents.map((doc) => (
        <li key={doc.path} className={ROW}>
          <span className="min-w-0 flex-1">
            {doc.url ? (
              <a
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                className={`${ROW_TITLE} break-words text-ink underline underline-offset-4`}
              >
                {doc.name}
              </a>
            ) : (
              <span className={`${ROW_TITLE} break-words text-ink`}>
                {doc.name}
              </span>
            )}
            {formatBytes(doc.sizeBytes) && (
              <span className={ROW_META}>
                {formatBytes(doc.sizeBytes)}
              </span>
            )}
          </span>

          {canDelete && (
            <form action={deleteHorseDocument} className="shrink-0">
              <input type="hidden" name="horse_id" value={horseId} />
              <input type="hidden" name="path" value={doc.path} />
              <Button type="submit" variant="danger">
                Remove
              </Button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
