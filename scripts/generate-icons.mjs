#!/usr/bin/env node
/**
 * Draws every app icon from one source: the Vistrial crest (public/brand/vistrial-crest.png, white on
 * transparent) on a brand-purple rounded square. Run with `node scripts/generate-icons.mjs` after the crest
 * or the brand colour changes, and commit the results.
 *
 *   src/app/favicon.ico          16, 32 and 48 px, for browsers that ask for /favicon.ico
 *   src/app/icon1.png            32 px tab icon        (Next's `icon` file convention)
 *   src/app/icon2.png            192 px                 (same convention, a sharper tab and shortcut icon)
 *   src/app/apple-icon.png       180 px, full-bleed square: iOS rounds the corners itself
 *   public/icons/icon-192.png    PWA icons, rounded square on transparent corners
 *   public/icons/icon-512.png
 *   public/icons/icon-*-maskable.png  full-bleed purple, crest inside the 80% safe zone
 *   public/icons/apple-touch-icon.png and public/apple-touch-icon.png, for clients that ask by path
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const root = join(import.meta.dirname, "..");
const CREST = join(root, "public/brand/vistrial-crest.png");

// brand-400 at the top-left to brand-700 at the bottom-right: the crest stays readable on the dark end,
// and the light end keeps the square recognisably Vistrial's violet.
const TOP = "#a493fd";
const BOTTOM = "#6650d8";

/** The crest cropped to its own shape, so it can be sized by height. */
async function crestPng() {
  return sharp(await readFile(CREST)).trim().png().toBuffer();
}

/**
 * One icon as SVG: the square (rounded unless `bleed`), the gradient, a soft top highlight, and the crest
 * centred at `crestHeight` of the side.
 */
function svg({ size, crest, crestMeta, bleed, crestHeight }) {
  const radius = bleed ? 0 : Math.round(size * 0.225);
  const h = size * crestHeight;
  const w = (h * crestMeta.width) / crestMeta.height;
  const x = (size - w) / 2;
  // The crest's point hangs low, so nudge it up a little to look centred.
  const y = (size - h) / 2 - size * 0.01;
  const href = `data:image/png;base64,${crest.toString("base64")}`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${TOP}"/>
      <stop offset="1" stop-color="${BOTTOM}"/>
    </linearGradient>
    <radialGradient id="hl" cx="0.3" cy="0.1" r="0.8">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)"/>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#hl)"/>
  <image x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" xlink:href="${href}" href="${href}"/>
</svg>`);
}

async function render(options) {
  return sharp(svg(options)).png({ compressionLevel: 9 }).toBuffer();
}

/** An .ico holding PNG images, which every current browser reads. */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

const crest = await crestPng();
const crestMeta = await sharp(crest).metadata();
const base = { crest, crestMeta };

// Small sizes get a bigger crest so it still reads at 16 px.
const small = (size) => render({ ...base, size, bleed: false, crestHeight: size <= 32 ? 0.74 : 0.68 });
const rounded = (size) => render({ ...base, size, bleed: false, crestHeight: 0.62 });
const square = (size) => render({ ...base, size, bleed: true, crestHeight: 0.6 });
const maskable = (size) => render({ ...base, size, bleed: true, crestHeight: 0.5 });

const outputs = {
  "src/app/favicon.ico": ico([
    { size: 16, data: await small(16) },
    { size: 32, data: await small(32) },
    { size: 48, data: await small(48) },
  ]),
  "src/app/icon1.png": await small(32),
  "src/app/icon2.png": await rounded(192),
  "src/app/apple-icon.png": await square(180),
  "public/icons/icon-192.png": await rounded(192),
  "public/icons/icon-512.png": await rounded(512),
  "public/icons/icon-192-maskable.png": await maskable(192),
  "public/icons/icon-512-maskable.png": await maskable(512),
  "public/icons/apple-touch-icon.png": await square(180),
  "public/apple-touch-icon.png": await square(180),
};

for (const [path, data] of Object.entries(outputs)) {
  await writeFile(join(root, path), data);
  console.log(`${path}  ${data.length} bytes`);
}
