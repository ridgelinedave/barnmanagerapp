#!/usr/bin/env node
/**
 * PDF writer test.
 *
 * `lib/pdf.ts` hand-writes PDF syntax to avoid a dependency in the legal-vault
 * path (see the file header). The trade for that is that nothing else checks
 * it: a wrong byte offset or a stream length counted in characters instead of
 * bytes produces a file that opens in a forgiving reader and fails in a strict
 * one — and the failure surfaces months later, when someone needs the signed
 * waiver.
 *
 * So this asserts the things a reader actually rejects on: the header, that
 * every xref offset really points at its object, that declared stream lengths
 * are byte lengths, escaping, encoding, and pagination.
 *
 * Run:  npm run test:pdf
 */
import { renderPdf } from "../lib/pdf.ts";

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("PDF writer\n");

const bytes = renderPdf([
  { text: "Crouse Equestrian", heading: true },
  { text: "Fixture Liability Waiver", heading: true, gap: true },
  { text: "Curly “quotes”, an em-dash — and an ellipsis…", gap: true },
  { text: "Emergency contact: A Person (with parens) and a \\ backslash" },
  { text: "Notes: " + "long text ".repeat(60) },
  // A page holds ~42 lines, so this forces a second one. Pagination is the
  // part most likely to be wrong and least likely to be noticed: a form that
  // silently loses its signature block off the bottom of page one still looks
  // like a PDF.
  ...Array.from({ length: 60 }, (_, i) => ({ text: `Additional question ${i + 1}: answered` })),
  { text: "Signature", heading: true, gap: true },
  { text: "Signed by: A Parent" },
]);

const text = Buffer.from(bytes).toString("latin1");

check("starts with a PDF header", text.startsWith("%PDF-1.4"));
check("ends with %%EOF", text.trimEnd().endsWith("%%EOF"));

const startxref = /startxref\s+(\d+)/.exec(text);
check("declares startxref", Boolean(startxref));

const xrefOffset = Number(startxref?.[1] ?? -1);
check(
  "startxref points at the xref table",
  text.slice(xrefOffset, xrefOffset + 4) === "xref",
  `found "${text.slice(xrefOffset, xrefOffset + 10)}"`,
);

const xrefSection = text.slice(xrefOffset);
const size = /\/Size (\d+)/.exec(text)?.[1];
const declaredCount = /xref\s+0 (\d+)/.exec(xrefSection)?.[1];
check("trailer /Size matches the xref subsection count", size === declaredCount, `${size} vs ${declaredCount}`);

// Every entry is exactly 20 bytes: 10-digit offset, 5-digit generation, flag,
// and two trailing characters. Readers index into this table by multiplication,
// so a short entry corrupts every object after it.
const entries = [...xrefSection.matchAll(/^(\d{10}) (\d{5}) ([nf]) $/gm)];
check(
  "every xref entry is a well-formed 20-byte record",
  entries.length === Number(declaredCount),
  `${entries.length} of ${declaredCount}`,
);

let offsetsGood = true;
let badOffset = "";
entries.forEach((entry, index) => {
  if (index === 0) return; // object 0 is the free entry
  const offset = Number(entry[1]);
  if (!text.slice(offset, offset + 12).startsWith(`${index} 0 obj`)) {
    offsetsGood = false;
    badOffset = `object ${index} at ${offset}`;
  }
});
check("every xref offset points at its own object", offsetsGood, badOffset);

const streams = [...text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)];
let lengthsGood = streams.length > 0;
let badLength = "";
for (const match of streams) {
  const start = (match.index ?? 0) + match[0].length;
  const end = text.indexOf("\nendstream", start);
  const actual = Buffer.byteLength(text.slice(start, end), "latin1");
  if (actual !== Number(match[1])) {
    lengthsGood = false;
    badLength = `declared ${match[1]}, actual ${actual}`;
  }
}
check("every stream /Length is the real BYTE length", lengthsGood, badLength);

check(
  "content longer than a page is paginated",
  (text.match(/\/Type \/Pages /g) ?? []).length === 1 &&
    Number(/\/Count (\d+)/.exec(text)?.[1] ?? 0) >= 2,
  `page count ${/\/Count (\d+)/.exec(text)?.[1]}`,
);

check("no byte outside latin1 survived", !/[^\x00-\xFF]/.test(text));
check(
  "parentheses and backslashes are escaped",
  text.includes("\\(with parens\\)") && text.includes("\\\\ backslash"),
);
check(
  "smart punctuation is transliterated rather than dropped",
  text.includes('"quotes"') && text.includes("-") && text.includes("..."),
);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("\nFailures:");
  for (const f of failures) console.error(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exitCode = 1;
} else {
  console.log("PDF output is structurally sound.");
}
