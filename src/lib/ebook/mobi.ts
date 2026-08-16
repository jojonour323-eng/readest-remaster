'use client';

// Lightweight MOBI / AZW3 (KF7/KF8) parser.
// Extracts: metadata (title/author), cover image, and the main HTML body.
// Based on the公开 MOBI spec; minimal but enough for browser reading.

export interface MobiMeta {
  title: string;
  author: string;
  cover?: string;
}

const EXTH_TYPE_COVER_OFFSET = 201; // cover offset
const EXTH_TYPE_THUMB_OFFSET = 202; // thumbnail offset
const EXTH_TYPE_AUTHOR = 100;
const EXTH_TYPE_TITLE = 503; // updated title

interface ParsedMobi {
  title: string;
  author: string;
  cover?: string;
  html: string;
}

export async function extractMobiMeta(data: ArrayBuffer): Promise<MobiMeta> {
  const parsed = await parseMobi(data);
  return { title: parsed.title, author: parsed.author, cover: parsed.cover };
}

export async function extractMobiHtml(data: ArrayBuffer): Promise<string> {
  const parsed = await parseMobi(data);
  return parsed.html;
}

export async function extractMobiPlainText(data: ArrayBuffer): Promise<string> {
  const html = await extractMobiHtml(data);
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

async function parseMobi(data: ArrayBuffer): Promise<ParsedMobi> {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);
  // PDB header
  if (view.getUint32(60, false) !== 0x424f4f4b) {
    // 'BOOK'
    throw new Error('Not a valid PalmDOC/MOBI file');
  }
  const numRecords = view.getUint16(76, false);
  const record0Offset = view.getUint32(78, false);

  // Record 0 has PalmDOC header (16 bytes) then MOBI header (if MOBI book)
  // PalmDOC: compression(2) unused(2) textLength(4) recordCount(2) recordSize(2) encryptionType(2) unused(2)
  const compression = view.getUint16(record0Offset, false);
  const mobiHeaderStart = record0Offset + 16;
  const magic = readString(bytes, mobiHeaderStart, 4);
  const isMobi = magic === 'MOBI';
  let textEncoding = 1252;
  let title = 'Untitled';
  let author = 'Unknown author';
  let cover: string | undefined;
  let firstImageRecord = -1;
  let coverOffset = -1;
  let thumbOffset = -1;

  if (isMobi) {
    // MOBI header
    textEncoding = view.getUint32(mobiHeaderStart + 28, false);
    const exthFlag = view.getUint32(mobiHeaderStart + 128, false);
    // image record index comes after various fields; try common offset
    firstImageRecord = view.getUint32(mobiHeaderStart + 108, false); // firstResourceIndex? approximate

    // Title in MOBI header at offset 84 (full title offset) and 88 (length), relative to record0
    const titleOffset = view.getUint32(mobiHeaderStart + 84, false);
    const titleLength = view.getUint32(mobiHeaderStart + 88, false);
    if (titleOffset > 0 && titleLength > 0) {
      title = readString(bytes, record0Offset + titleOffset, titleLength);
    }

    if (exthFlag & 0x40) {
      const exthOffset = mobiHeaderStart + 132; // typically
      const recCount = view.getUint32(exthOffset + 8, false);
      let p = exthOffset + 12;
      for (let i = 0; i < recCount; i++) {
        const type = view.getUint32(p, false);
        const len = view.getUint32(p + 4, false);
        const dataStart = p + 8;
        const dataEnd = p + len;
        if (type === EXTH_TYPE_AUTHOR) {
          author = decodeExthString(bytes, dataStart, len - 8, textEncoding);
        } else if (type === EXTH_TYPE_TITLE) {
          title = decodeExthString(bytes, dataStart, len - 8, textEncoding);
        } else if (type === EXTH_TYPE_COVER_OFFSET) {
          coverOffset = view.getUint32(dataStart, false);
        } else if (type === EXTH_TYPE_THUMB_OFFSET) {
          thumbOffset = view.getUint32(dataStart, false);
        }
        p = dataEnd;
      }
    }
  }

  // Records 1..(numRecords-1) are text records (and image records after firstImageRecord)
  // Determine text record count
  const textRecordCount = isMobi && firstImageRecord > 0
    ? Math.min(firstImageRecord - 1, numRecords - 1)
    : numRecords - 1;

  const textParts: Uint8Array[] = [];
  for (let i = 1; i <= textRecordCount; i++) {
    const off = view.getUint32(78 + i * 8, false);
    const nextOff = view.getUint32(78 + (i + 1) * 8, false);
    const len = nextOff - off;
    const raw = bytes.subarray(off, off + len);
    if (compression === 1) {
      textParts.push(raw);
    } else if (compression === 2) {
      textParts.push(palmDocDecompress(raw));
    } else {
      textParts.push(raw);
    }
  }
  const textBytes = concatUint8(textParts);
  const html = decodeExthString(textBytes, 0, textBytes.length, textEncoding);

  // Cover image
  if (coverOffset >= 0 && firstImageRecord > 0) {
    const imgRec = firstImageRecord + coverOffset;
    try {
      cover = await extractImage(data, imgRec);
    } catch {
      cover = undefined;
    }
  } else if (thumbOffset >= 0 && firstImageRecord > 0) {
    const imgRec = firstImageRecord + thumbOffset;
    try {
      cover = await extractImage(data, imgRec);
    } catch {
      cover = undefined;
    }
  }

  return { title, author, cover, html };
}

function readString(bytes: Uint8Array, offset: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[offset + i]);
  return s;
}

function decodeExthString(
  bytes: Uint8Array,
  offset: number,
  len: number,
  encoding: number,
): string {
  const slice = bytes.subarray(offset, offset + len);
  if (encoding === 65001) {
    return new TextDecoder('utf-8').decode(slice);
  }
  // Default windows-1252
  try {
    return new TextDecoder('windows-1252').decode(slice);
  } catch {
    return new TextDecoder('utf-8').decode(slice);
  }
}

function concatUint8(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const a of arrays) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

// PalmDOC LZ77 decompression (record-wise)
function palmDocDecompress(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i++];
    if (c === 0) {
      out.push(0);
      continue;
    }
    if (c <= 8) {
      // copy next c bytes literally
      for (let j = 0; j < c && i < input.length; j++) out.push(input[i++]);
      continue;
    }
    if (c <= 0x7f) {
      out.push(c);
      continue;
    }
    if (c <= 0xbf) {
      if (i >= input.length) break;
      const next = input[i++];
      const pair = ((c << 8) | next) & 0x3fff;
      const dist = (pair >> 3) & 0x7ff;
      const len = (pair & 0x7) + 3;
      const start = out.length - dist;
      if (start < 0) continue;
      for (let j = 0; j < len; j++) out.push(out[start + j] ?? 0);
      continue;
    }
    // 0xc0..0xff -> space + (c & 0x7f)
    out.push(0x20);
    out.push(c & 0x7f);
  }
  return new Uint8Array(out);
}

async function extractImage(data: ArrayBuffer, recordIndex: number): Promise<string | undefined> {
  const view = new DataView(data);
  const off = view.getUint32(78 + recordIndex * 8, false);
  const nextOff = view.getUint32(78 + (recordIndex + 1) * 8, false);
  const len = nextOff - off;
  const bytes = new Uint8Array(data, off, len);
  // Detect type from magic bytes
  let mime = 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) mime = 'image/png';
  else if (bytes[0] === 0x47 && bytes[1] === 0x49) mime = 'image/gif';
  // Strip EXTH record headers (TAWS) by finding the JPEG SOI marker
  let start = 0;
  for (let i = 0; i < Math.min(bytes.length - 1, 64); i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8) {
      start = i;
      break;
    }
    if (bytes[i] === 0x89 && bytes[i + 1] === 0x50) {
      start = i;
      break;
    }
  }
  const blob = new Blob([bytes.subarray(start)], { type: mime });
  return await blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}
