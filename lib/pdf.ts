/**
 * A very small PDF writer — enough for a signed form, and nothing more.
 *
 * Deliberately NOT `server-only`: this is a pure function over strings with no
 * I/O, no secrets and no database access, which means it can be exercised
 * directly by a test rather than only through a signed form. The module that
 * uses it (`more/forms/actions.ts`) is the server-only one.
 *
 * WHY NOT A LIBRARY: the only thing this app ever has to render is a page of
 * labelled text and a signature block. pdf-lib and pdfkit are both an order of
 * magnitude larger than the problem, and a dependency in the legal-vault path
 * is a dependency that has to be audited for as long as the vault matters.
 * Roughly 120 lines of PDF syntax avoids that trade entirely.
 *
 * WHAT IT DOES NOT DO: embedded fonts (Helvetica is one of the 14 built-ins
 * every reader ships), images, unicode beyond Latin-1, or text measurement. Line
 * breaking is by character count against a monospace-ish assumption, which is
 * why the layout is generous. If a form ever needs a logo or a table, replace
 * this with a real library rather than growing it.
 */

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const LINE_HEIGHT = 16;
const BODY_SIZE = 11;
const HEADING_SIZE = 16;
/** Characters per line at BODY_SIZE. Deliberately conservative — see above. */
const WRAP_AT = 82;

export type PdfLine = { text: string; heading?: boolean; gap?: boolean };

/** PDF strings are parenthesised, so those three characters must be escaped. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/**
 * Latin-1 is what the built-in Helvetica encoding covers. Anything outside it
 * is transliterated where there is an obvious equivalent and dropped otherwise
 * — a missing curly quote is a cosmetic problem; a corrupt byte in a legal
 * document is not.
 */
function toLatin1(value: string): string {
  return value
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  // A single word longer than the line (a URL, a long email) still has to fit.
  return lines.flatMap((line) =>
    line.length <= width ? [line] : (line.match(new RegExp(`.{1,${width}}`, "g")) ?? [line]),
  );
}

/** Split the laid-out lines into pages that fit. */
function paginate(lines: PdfLine[]): PdfLine[][] {
  const usable = PAGE_HEIGHT - MARGIN * 2;
  const perPage = Math.floor(usable / LINE_HEIGHT);

  const pages: PdfLine[][] = [];
  let page: PdfLine[] = [];

  for (const line of lines) {
    const cost = line.gap ? 2 : 1;
    if (page.length + cost > perPage) {
      pages.push(page);
      page = [];
    }
    page.push(line);
  }
  if (page.length > 0) pages.push(page);
  return pages.length > 0 ? pages : [[]];
}

function contentStream(lines: PdfLine[]): string {
  const parts: string[] = ["BT"];
  let y = PAGE_HEIGHT - MARGIN;
  let currentSize = 0;

  for (const line of lines) {
    if (line.gap) y -= LINE_HEIGHT;

    const size = line.heading ? HEADING_SIZE : BODY_SIZE;
    if (size !== currentSize) {
      parts.push(`/F1 ${size} Tf`);
      currentSize = size;
    }

    parts.push(`1 0 0 1 ${MARGIN} ${y} Tm`);
    parts.push(`(${escapeText(toLatin1(line.text))}) Tj`);
    y -= LINE_HEIGHT;
  }

  parts.push("ET");
  return parts.join("\n");
}

/**
 * Render lines to a PDF.
 *
 * Returns a Uint8Array so the caller can hand it straight to Storage. Offsets
 * in the xref table are BYTE offsets, so everything is measured in latin1 —
 * counting characters here would produce a file that opens in a forgiving
 * reader and fails in a strict one.
 */
export function renderPdf(lines: PdfLine[]): Uint8Array {
  const wrapped: PdfLine[] = lines.flatMap((line) => {
    const width = line.heading ? Math.floor(WRAP_AT * 0.7) : WRAP_AT;
    const segments = wrap(line.text, width);
    return segments.map((text, index) => ({
      text,
      heading: line.heading,
      gap: index === 0 ? line.gap : false,
    }));
  });

  const pages = paginate(wrapped);

  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];

  // 1 catalog, 2 pages, 3 font, then per page: content + page object.
  const firstPageObject = 4;
  pages.forEach((_, index) => {
    pageObjectNumbers.push(firstPageObject + index * 2 + 1);
  });

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjectNumbers
    .map((n) => `${n} 0 R`)
    .join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  pages.forEach((pageLines, index) => {
    const contentNumber = firstPageObject + index * 2;
    const pageNumber = contentNumber + 1;
    const stream = contentStream(pageLines);
    const length = Buffer.byteLength(stream, "latin1");

    objects[contentNumber] = `<< /Length ${length} >>\nstream\n${stream}\nendstream`;
    objects[pageNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNumber} 0 R >>`;
  });

  let file = "%PDF-1.4\n";
  const offsets: number[] = [];

  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(file, "latin1");
    file += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(file, "latin1");
  const count = objects.length; // objects are 1..n, plus the free entry 0

  file += `xref\n0 ${count}\n`;
  file += "0000000000 65535 f \n";
  for (let i = 1; i < objects.length; i++) {
    file += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  file += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(file, "latin1"));
}
