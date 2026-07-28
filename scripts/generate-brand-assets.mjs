#!/usr/bin/env node
/**
 * Generates the PWA icons and the iOS launch images from the REAL Crouse crest.
 *
 *   npm run brand:assets
 *
 * Replaces the earlier generated monogram: these are derived from
 * public/brand/crouse-logo.png, composited on the brand's own dark field.
 *
 * Zero dependencies — decodes the source PNG and writes the outputs by hand
 * (node:zlib for both directions). Adding an image library for a build step
 * that runs when the logo changes, i.e. almost never, is not worth the
 * dependency.
 *
 * Downscaling is a box filter (average over each destination pixel's source
 * footprint), not nearest-neighbour. At 1500px → 192px, nearest-neighbour
 * throws away 98% of the pixels and turns the crest's fine gold lettering into
 * noise.
 */
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Config, read from the barn file so a clone regenerates its own assets.
// ---------------------------------------------------------------------------
const config = readFileSync(join(root, "config", "barn.ts"), "utf8");
const readHex = (key) => {
  const match = config.match(new RegExp(`${key}:\\s*"(#[0-9a-fA-F]{6})"`));
  if (!match) throw new Error(`Could not read ${key} from config/barn.ts`);
  return match[1];
};
const readPath = (key) => {
  const match = config.match(new RegExp(`${key}:\\s*"([^"]+)"`));
  if (!match) throw new Error(`Could not read ${key} from config/barn.ts`);
  return match[1];
};

const INK = readHex("launchBackground");
const GOLD = readHex("gold");
const LOGO = readPath("logoSrc");

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

// ---------------------------------------------------------------------------
// PNG decode (8-bit palette or truecolour, non-interlaced) → RGBA
// ---------------------------------------------------------------------------
function decodePng(buf) {
  let pos = 8;
  let ihdr = null;
  let plte = null;
  let trns = null;
  const idat = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "PLTE") plte = Buffer.from(data);
    else if (type === "tRNS") trns = Buffer.from(data);
    else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
    pos += 12 + len;
  }

  if (ihdr.bitDepth !== 8 || ihdr.interlace !== 0) {
    throw new Error(`Unsupported PNG: depth ${ihdr.bitDepth}, interlace ${ihdr.interlace}`);
  }

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.colorType];
  if (!channels) throw new Error(`Unsupported colour type ${ihdr.colorType}`);

  const { width, height } = ihdr;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const line = raw.subarray(rowStart + 1, rowStart + 1 + stride);
    const cur = Buffer.alloc(stride);

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      const v = line[x];
      let val;
      if (filter === 0) val = v;
      else if (filter === 1) val = v + a;
      else if (filter === 2) val = v + b;
      else if (filter === 3) val = v + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        val = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      cur[x] = val & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }

  // Normalise everything to RGBA.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    let r;
    let g;
    let b;
    let a = 255;
    if (ihdr.colorType === 3) {
      const idx = out[i];
      r = plte[idx * 3];
      g = plte[idx * 3 + 1];
      b = plte[idx * 3 + 2];
      a = trns && idx < trns.length ? trns[idx] : 255;
    } else if (ihdr.colorType === 2) {
      r = out[i * 3];
      g = out[i * 3 + 1];
      b = out[i * 3 + 2];
    } else if (ihdr.colorType === 6) {
      r = out[i * 4];
      g = out[i * 4 + 1];
      b = out[i * 4 + 2];
      a = out[i * 4 + 3];
    } else if (ihdr.colorType === 0) {
      r = g = b = out[i];
    } else {
      r = g = b = out[i * 2];
      a = out[i * 2 + 1];
    }
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = a;
  }

  return { width, height, rgba };
}

// ---------------------------------------------------------------------------
// PNG encode
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
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
  ihdr[8] = 8;
  ihdr[9] = 6;

  const rawRow = 1 + width * 4;
  const raw = Buffer.alloc(height * rawRow);
  for (let y = 0; y < height; y++) {
    raw[y * rawRow] = 0;
    rgba.copy(raw, y * rawRow + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Compositing
// ---------------------------------------------------------------------------
const source = decodePng(readFileSync(join(root, "public", LOGO.replace(/^\//, ""))));

/** Box-filter resample of the source into a w×h RGBA buffer. */
function resample(w, h) {
  const out = Buffer.alloc(w * h * 4);
  const xRatio = source.width / w;
  const yRatio = source.height / h;

  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor(y * yRatio);
    const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * yRatio));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x * xRatio);
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * xRatio));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1 && sy < source.height; sy++) {
        for (let sx = sx0; sx < sx1 && sx < source.width; sx++) {
          const i = (sy * source.width + sx) * 4;
          const alpha = source.rgba[i + 3] / 255;
          // Weight colour by alpha so transparent pixels do not drag the
          // edges toward black.
          r += source.rgba[i] * alpha;
          g += source.rgba[i + 1] * alpha;
          b += source.rgba[i + 2] * alpha;
          a += source.rgba[i + 3];
          n++;
        }
      }
      const o = (y * w + x) * 4;
      const alphaAvg = a / n;
      const weight = alphaAvg / 255 || 1;
      out[o] = Math.round(r / n / weight);
      out[o + 1] = Math.round(g / n / weight);
      out[o + 2] = Math.round(b / n / weight);
      out[o + 3] = Math.round(alphaAvg);
    }
  }
  return out;
}

/** Crest centred on a solid field, occupying `scale` of the shorter side. */
function compose(width, height, background, scale) {
  const [br, bg, bb] = hexToRgb(background);
  const canvas = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    canvas[i * 4] = br;
    canvas[i * 4 + 1] = bg;
    canvas[i * 4 + 2] = bb;
    canvas[i * 4 + 3] = 255;
  }

  const box = Math.round(Math.min(width, height) * scale);
  const logo = resample(box, box);
  const offsetX = Math.round((width - box) / 2);
  const offsetY = Math.round((height - box) / 2);

  for (let y = 0; y < box; y++) {
    for (let x = 0; x < box; x++) {
      const s = (y * box + x) * 4;
      const alpha = logo[s + 3] / 255;
      if (alpha === 0) continue;
      const d = ((y + offsetY) * width + (x + offsetX)) * 4;
      canvas[d] = Math.round(logo[s] * alpha + canvas[d] * (1 - alpha));
      canvas[d + 1] = Math.round(logo[s + 1] * alpha + canvas[d + 1] * (1 - alpha));
      canvas[d + 2] = Math.round(logo[s + 2] * alpha + canvas[d + 2] * (1 - alpha));
    }
  }

  return encodePng(width, height, canvas);
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
const iconsDir = join(root, "public", "icons");
const splashDir = join(root, "public", "splash");
mkdirSync(iconsDir, { recursive: true });
mkdirSync(splashDir, { recursive: true });

console.log(`source: ${LOGO} (${source.width}×${source.height})`);
console.log(`field:  ${INK}   accent: ${GOLD}\n`);

const icons = [
  ["icon-192.png", 192, 192, 0.92],
  ["icon-512.png", 512, 512, 0.92],
  // Maskable icons get cropped to a circle by the OS, so the crest is inset
  // into the 80% safe zone — at 0.92 the diamond's corners would be clipped.
  ["icon-maskable-512.png", 512, 512, 0.66],
];

for (const [name, w, h, scale] of icons) {
  const png = compose(w, h, INK, scale);
  writeFileSync(join(iconsDir, name), png);
  console.log(`  icons/${name.padEnd(24)} ${(png.length / 1024).toFixed(1)} kB`);
}

/**
 * iOS launch images. Safari needs an exact match per device, keyed by CSS
 * dimensions and pixel ratio — there is no "just scale it" option, which is why
 * this list is explicit.
 */
const SPLASH = [
  { w: 1170, h: 2532, cssW: 390, cssH: 844, ratio: 3 },
  { w: 1179, h: 2556, cssW: 393, cssH: 852, ratio: 3 },
  { w: 1284, h: 2778, cssW: 428, cssH: 926, ratio: 3 },
  { w: 1290, h: 2796, cssW: 430, cssH: 932, ratio: 3 },
  { w: 1125, h: 2436, cssW: 375, cssH: 812, ratio: 3 },
  { w: 828, h: 1792, cssW: 414, cssH: 896, ratio: 2 },
  { w: 750, h: 1334, cssW: 375, cssH: 667, ratio: 2 },
];

const manifestEntries = [];
for (const s of SPLASH) {
  const name = `splash-${s.w}x${s.h}.png`;
  const png = compose(s.w, s.h, INK, 0.42);
  writeFileSync(join(splashDir, name), png);
  manifestEntries.push({ ...s, name });
  console.log(`  splash/${name.padEnd(23)} ${(png.length / 1024).toFixed(1)} kB`);
}

writeFileSync(
  join(splashDir, "index.json"),
  `${JSON.stringify(manifestEntries, null, 2)}\n`,
);

console.log("\n✓ Brand assets generated from the real crest.");
