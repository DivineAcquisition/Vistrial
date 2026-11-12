/**
 * A plain .zip, written by hand so an export needs no package: files are stored as they are (not
 * compressed), which every unzip tool reads. Names are UTF-8. Enough for text and JSON; not for files
 * over 4 GB.
 */

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A file name that is safe inside a zip and on any disk: no path tricks, no odd characters, not too long. */
export function safeName(text: string, fallback = "untitled"): string {
  const cleaned = text
    .normalize("NFKD")
    .replace(/[^\w .()-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[ .]+|[ .]+$/g, "")
    .slice(0, 80)
    .trim();
  return cleaned || fallback;
}

export type ZipFile = { path: string; text: string };

/** The bytes of a zip holding these files. Two files with one path keep both: the later gets a number. */
export function zip(files: ZipFile[], at = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const seen = new Map<string, number>();
  const entries = files.map((file) => {
    const count = seen.get(file.path) ?? 0;
    seen.set(file.path, count + 1);
    const path = count === 0 ? file.path : file.path.replace(/(\.[a-z0-9]+)?$/i, (ext) => ` (${count + 1})${ext}`);
    const data = encoder.encode(file.text);
    return { name: encoder.encode(path), data, crc: crc32(data) };
  });
  const time = ((at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | (at.getUTCSeconds() >> 1)) & 0xffff;
  const date = (((Math.max(at.getUTCFullYear(), 1980) - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate()) & 0xffff;

  const size = entries.reduce((sum, entry) => sum + 30 + entry.name.length + entry.data.length + 46 + entry.name.length, 22);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let offset = 0;
  const offsets: number[] = [];
  for (const entry of entries) {
    offsets.push(offset);
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 0x0800, true); // names are UTF-8
    view.setUint16(offset + 8, 0, true); // stored
    view.setUint16(offset + 10, time, true);
    view.setUint16(offset + 12, date, true);
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.data.length, true);
    view.setUint32(offset + 22, entry.data.length, true);
    view.setUint16(offset + 26, entry.name.length, true);
    view.setUint16(offset + 28, 0, true);
    out.set(entry.name, offset + 30);
    out.set(entry.data, offset + 30 + entry.name.length);
    offset += 30 + entry.name.length + entry.data.length;
  }
  const directory = offset;
  entries.forEach((entry, index) => {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, 0x0800, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, time, true);
    view.setUint16(offset + 14, date, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.data.length, true);
    view.setUint32(offset + 24, entry.data.length, true);
    view.setUint16(offset + 28, entry.name.length, true);
    view.setUint32(offset + 42, offsets[index], true);
    out.set(entry.name, offset + 46);
    offset += 46 + entry.name.length;
  });
  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, offset - directory, true);
  view.setUint32(offset + 16, directory, true);
  return out;
}
