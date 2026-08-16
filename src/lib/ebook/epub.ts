'use client';

import ePub, { type Book, type Rendition } from 'epubjs';
import JSZip from 'jszip';
import type { BookMeta } from '../types';

// Extract EPUB metadata + cover.
export async function extractEpubMeta(
  data: ArrayBuffer,
): Promise<{ title: string; author: string; cover?: string }> {
  const book = ePub(data);
  try {
    // Wait for the book to fully open (manifest, spine, resources) before
    // destroying it, otherwise in-flight resource promises can throw.
    await Promise.race([
      Promise.all([book.ready, book.opened]),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
    const meta = await book.loaded.metadata;
    let cover: string | undefined;
    try {
      const url = await book.coverUrl();
      if (url) {
        // epub.js returns a blob: URL which is scoped to this document and
        // does NOT survive a page reload. Convert it to a data URL so the
        // cover can be displayed from IndexedDB on subsequent sessions.
        cover = await blobUrlToDataUrl(url);
      }
    } catch {
      // ignore cover errors
    }
    return {
      title: meta.title || 'Untitled',
      author: meta.creator || 'Unknown author',
      cover,
    };
  } finally {
    try {
      book.destroy();
    } catch {
      // ignore destroy errors
    }
  }
}

// Convert a blob: URL (or any URL fetchable in this document) to a data URL.
async function blobUrlToDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

export interface EpubInstance {
  book: Book;
  rendition?: Rendition;
  destroy: () => void;
}

export async function openEpub(data: ArrayBuffer): Promise<EpubInstance> {
  const book = ePub(data);
  await book.ready;
  return {
    book,
    destroy: () => {
      try {
        book.destroy();
      } catch {
        // ignore
      }
    },
  };
}

// Build a simple search index by walking spine items.
export async function extractEpubPlainText(data: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) return '';
  const containerXml = await containerFile.async('string');
  const opfPath = /full-path="([^"]+)"/.exec(containerXml)?.[1];
  if (!opfPath) return '';
  const opfFile = zip.file(opfPath);
  if (!opfFile) return '';
  const opfXml = await opfFile.async('string');
  const manifest = new Map<string, string>();
  const spine: string[] = [];
  const itemRe = /<item\b[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*media-type="([^"]+)"[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(opfXml))) {
    if (m[3] === 'application/xhtml+xml' || m[3] === 'text/html') {
      const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
      manifest.set(m[1], base + m[2]);
    }
  }
  const spineRe = /<itemref\b[^>]*idref="([^"]+)"[^>]*\/?>/g;
  while ((m = spineRe.exec(opfXml))) {
    if (manifest.has(m[1])) spine.push(m[1]);
  }
  const out: string[] = [];
  for (const idref of spine) {
    const href = manifest.get(idref);
    if (!href) continue;
    const f = zip.file(href);
    if (!f) continue;
    const html = await f.async('string');
    // Strip tags
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) out.push(text);
  }
  return out.join('\n\n');
}

// Re-export the underlying type for callers
export type { BookMeta };
