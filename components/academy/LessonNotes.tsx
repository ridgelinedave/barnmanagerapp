import type { ReactNode } from "react";

/**
 * The barn owner's lesson notes, lightly formatted — the parts of Circle's
 * lesson description that carry over from plain text: paragraphs (a blank
 * line), bullet lists (lines starting "- " or "* "), **bold**, and web
 * addresses that open when tapped.
 *
 * Built as React elements from the text, never as HTML: nothing typed into
 * the notes can inject markup or script. Links open in a new tab with no
 * referrer and no opener.
 */
const URL_OR_BOLD = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|\*\*([^*]+)\*\*/g;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(URL_OR_BOLD)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (m[1]) {
      out.push(
        <a
          key={`${keyBase}-${i++}`}
          href={m[1]}
          target="_blank"
          rel="noopener noreferrer"
          className="break-words text-accent-text underline underline-offset-2"
        >
          {m[1].replace(/^https?:\/\//, "")}
        </a>,
      );
    } else {
      out.push(
        <strong key={`${keyBase}-${i++}`} className="font-semibold">
          {m[2]}
        </strong>,
      );
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function LessonNotes({ text }: { text: string }) {
  // A form submits a textarea with CRLF line ends; work in plain \n.
  const blocks = text.replace(/\r\n?/g, "\n").trim().split(/\n\s*\n/);
  return (
    <div className="flex flex-col gap-3 text-body leading-relaxed text-ink">
      {blocks.map((block, b) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={b} className="flex list-disc flex-col gap-1 pl-5">
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(/^\s*[-*]\s+/, ""), `${b}-${i}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={b} className="whitespace-pre-line">
            {inline(block, `${b}`)}
          </p>
        );
      })}
    </div>
  );
}
