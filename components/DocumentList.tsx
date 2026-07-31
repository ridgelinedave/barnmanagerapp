import { Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
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
      <p className="rounded-card border border-line bg-surface p-4 text-caption text-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {documents.map((doc) => (
        <Card
          as="li"
          key={doc.path}
          className="flex min-h-16 items-center gap-3 p-4"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-sunk text-gold-deep">
            <Icon name="document" className="size-5" />
          </span>

          <span className="min-w-0 flex-1">
            {doc.url ? (
              <a
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                className="block break-words font-display text-heading leading-snug text-ink underline underline-offset-4"
              >
                {doc.name}
              </a>
            ) : (
              <span className="block break-words font-display text-heading leading-snug text-ink">
                {doc.name}
              </span>
            )}
            {formatBytes(doc.sizeBytes) && (
              <span className="mt-0.5 block text-caption text-muted">
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
        </Card>
      ))}
    </ul>
  );
}
