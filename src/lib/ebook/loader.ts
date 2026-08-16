import type { BookFormat, BookMeta } from '../types';

export function detectFormat(fileName: string): BookFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.epub')) return 'epub';
  if (lower.endsWith('.mobi')) return 'mobi';
  if (lower.endsWith('.azw3') || lower.endsWith('.azw')) return 'azw3';
  if (lower.endsWith('.fb2')) return 'fb2';
  if (lower.endsWith('.cbz') || lower.endsWith('.cbr') || lower.endsWith('.zip')) return 'cbz';
  if (lower.endsWith('.txt')) return 'txt';
  if (lower.endsWith('.pdf')) return 'pdf';
  return null;
}

export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// Extract metadata quickly from a file. Heavy lifting deferred to readers.
export async function extractMeta(
  file: File | ArrayBuffer,
  fileName: string,
): Promise<{ title: string; author: string; cover?: string; format: BookFormat }> {
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const format = detectFormat(fileName) ?? 'txt';

  if (format === 'epub') {
    try {
      const { extractEpubMeta } = await import('./epub');
      const m = await extractEpubMeta(data);
      return { ...m, format };
    } catch {
      return { title: fileName.replace(/\.epub$/i, ''), author: 'Unknown author', format };
    }
  }
  if (format === 'fb2') {
    try {
      const { extractFb2Meta } = await import('./fb2');
      const m = await extractFb2Meta(data);
      return { ...m, format };
    } catch {
      return { title: fileName.replace(/\.fb2$/i, ''), author: 'Unknown author', format };
    }
  }
  if (format === 'cbz') {
    return { title: fileName.replace(/\.cbz$/i, ''), author: 'Unknown author', format };
  }
  if (format === 'txt') {
    try {
      const dec = new TextDecoder('utf-8');
      const text = dec.decode(data.slice(0, 4096));
      const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? '';
      return {
        title: firstLine.slice(0, 80) || fileName.replace(/\.txt$/i, ''),
        author: 'Unknown author',
        format,
      };
    } catch {
      return { title: fileName.replace(/\.txt$/i, ''), author: 'Unknown author', format };
    }
  }
  if (format === 'mobi' || format === 'azw3') {
    try {
      const { extractMobiMeta } = await import('./mobi');
      const m = await extractMobiMeta(data);
      return { ...m, format };
    } catch {
      return { title: fileName.replace(/\.(mobi|azw3|azw)$/i, ''), author: 'Unknown author', format };
    }
  }
  return { title: fileName, author: 'Unknown author', format };
}

export function bookFromFile(
  meta: { title: string; author: string; cover?: string; format: BookFormat },
  fileName: string,
  size: number,
): BookMeta {
  return {
    id: makeId(),
    title: meta.title || fileName,
    author: meta.author || 'Unknown author',
    cover: meta.cover,
    format: meta.format,
    size,
    addedAt: Date.now(),
    lastReadAt: undefined,
    progress: 0,
    tags: [],
    source: 'local',
  };
}
