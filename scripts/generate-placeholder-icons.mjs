#!/usr/bin/env node
/**
 * Generates PLACEHOLDER PWA icons from the brand colours in /config/barn.ts.
 *
 * These are scaffolding, not brand assets. Replace public/icons/*.png with real
 * artwork derived from Belle's logo before the app goes live.
 *
 * Zero dependencies: writes PNGs directly (IHDR + IDAT + IEND) using node:zlib.
 *
 *   node scripts/generate-placeholder-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Pull the hex values out of config/barn.ts so the icons follow the config. */
function readBrandColors() {
  const source = readFileSync(join(root, "config", "barn.ts"), "utf8");
  const pick = (key) => {
    const match = source.match(new RegExp(`${key}:\\s*"(#[0-9a-fA-F]{6})"`));
    if (!match) throw new Error(`Could not read brand.${key} from config/barn.ts`);
    return match[1];
  };
  return { gold: pick("gold"), cream: pick("cream") };
}

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

function crc32(buf) {
  let c;
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12: compression, filter, interlace — all 0

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Draws a "C" monogram: a cream annulus with a wedge removed on the right,
 * on a gold field. `inset` shrinks the mark for maskable icons so the safe
 * zone is respected.
 */
function drawIcon(size, { gold, cream }, inset = 0) {
  const rgba = Buffer.alloc(size * size * 4);
  const [gr, gg, gb] = hexToRgb(gold);
  const [cr, cg, cb] = hexToRgb(cream);

  const cx = size / 2;
  const cy = size / 2;
  const scale = 1 - inset;
  const outer = size * 0.34 * scale;
  const inner = size * 0.23 * scale;
  const corner = size * 0.22;
  const aa = Math.max(1, size / 160);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      // Rounded-square background (squircle-ish), transparent outside.
      const dx = Math.max(Math.abs(px - cx) - (size / 2 - corner), 0);
      const dy = Math.max(Math.abs(py - cy) - (size / 2 - corner), 0);
      const outside = Math.hypot(dx, dy) - corner;
      const bgAlpha = clamp01(0.5 - outside / aa);

      // The C: annulus minus a wedge on the right-hand side.
      const r = Math.hypot(px - cx, py - cy);
      const angle = Math.atan2(py - cy, px - cx); // -PI..PI, 0 = right
      const inRing =
        clamp01((outer - r) / aa) * clamp01((r - inner) / aa) * (Math.abs(angle) > 0.62 ? 1 : 0);

      const i = (y * size + x) * 4;
      const r0 = gr + (cr - gr) * inRing;
      const g0 = gg + (cg - gg) * inRing;
      const b0 = gb + (cb - gb) * inRing;

      rgba[i] = Math.round(r0);
      rgba[i + 1] = Math.round(g0);
      rgba[i + 2] = Math.round(b0);
      rgba[i + 3] = Math.round(255 * bgAlpha);
    }
  }
  return encodePng(size, size, rgba);
}

const clamp01 = (n) => Math.min(1, Math.max(0, n));

const colors = readBrandColors();
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const outputs = [
  ["icon-192.png", drawIcon(192, colors)],
  ["icon-512.png", drawIcon(512, colors)],
  // Maskable icons are cropped to a circle by the OS — inset the mark 20%.
  ["icon-maskable-512.png", drawIcon(512, colors, 0.2)],
];

for (const [name, buffer] of outputs) {
  writeFileSync(join(outDir, name), buffer);
  console.log(`wrote public/icons/${name} (${buffer.length} bytes)`);
}

console.log("\nPLACEHOLDER icons — replace with real artwork before launch.");
