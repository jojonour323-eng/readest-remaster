'use client';

import localforage from 'localforage';
import type {
  BookMeta,
  Bookmark,
  Highlight,
  Simplification,
  ReaderSettings,
} from './types';

const STORES = {
  books: 'books',
  files: 'files',          // raw ArrayBuffer of each book
  bookmarks: 'bookmarks',
  highlights: 'highlights',
  simplifications: 'simplifications',
  settings: 'settings',
  sync: 'sync',            // sync metadata for cross-device
} as const;

function makeStore<T>(name: string, key: string) {
  return localforage.createInstance({
    name: 'readest-web',
    storeName: name,
    description: 'Readest Web reader storage',
  }) as LocalForage & {
    getItem: (k: string) => Promise<T | null>;
    setItem: (k: string, v: T) => Promise<T>;
  };
}

// We do NOT use a key argument; createInstance returns a per-store instance.
const bookStore = localforage.createInstance({
  name: 'readest-web',
  storeName: STORES.books,
});
const fileStore = localforage.createInstance({
  name: 'readest-web',
  storeName: STORES.files,
});
const bookmarkStore = localforage.createInstance({
  name: 'readest-web',
  storeName: STORES.bookmarks,
});
const highlightStore = localforage.createInstance({
  name: 'readest-web',
  storeName: STORES.highlights,
});
const simplificationStore = localforage.createInstance({
  name: 'readest-web',
  storeName: STORES.simplifications,
});
const settingsStore = localforage.createInstance({
  name: 'readest-web',
  storeName: STORES.settings,
});
const syncStore = localforage.createInstance({
  name: 'readest-web',
  storeName: STORES.sync,
});

// === Books ===
export async function listBooks(): Promise<BookMeta[]> {
  const items: BookMeta[] = [];
  await bookStore.iterate<BookMeta, void>((value) => {
    items.push(value);
  });
  return items.sort((a, b) => (b.lastReadAt ?? b.addedAt) - (a.lastReadAt ?? a.addedAt));
}

export async function getBook(id: string): Promise<BookMeta | null> {
  return (await bookStore.getItem(id)) as BookMeta | null;
}

export async function saveBook(book: BookMeta): Promise<void> {
  await bookStore.setItem(book.id, book);
  await touchSync();
}

export async function deleteBook(id: string): Promise<void> {
  await bookStore.removeItem(id);
  await fileStore.removeItem(id);
  // cascade
  const bks = await listBookmarks(id);
  await Promise.all(bks.map((b) => bookmarkStore.removeItem(b.id)));
  const hls = await listHighlights(id);
  await Promise.all(hls.map((h) => highlightStore.removeItem(h.id)));
  const ss = await listSimplifications(id);
  await Promise.all(ss.map((s) => simplificationStore.removeItem(s.id)));
  await touchSync();
}

// === Raw files ===
export async function saveBookFile(id: string, data: ArrayBuffer): Promise<void> {
  await fileStore.setItem(id, data);
}

export async function getBookFile(id: string): Promise<ArrayBuffer | null> {
  return (await fileStore.getItem(id)) as ArrayBuffer | null;
}

// === Bookmarks ===
export async function listBookmarks(bookId: string): Promise<Bookmark[]> {
  const items: Bookmark[] = [];
  await bookmarkStore.iterate<Bookmark, void>((v) => {
    if (v.bookId === bookId) items.push(v);
  });
  return items.sort((a, b) => a.progress - b.progress);
}

export async function saveBookmark(b: Bookmark): Promise<void> {
  await bookmarkStore.setItem(b.id, b);
  await touchSync();
}

export async function deleteBookmark(id: string): Promise<void> {
  await bookmarkStore.removeItem(id);
  await touchSync();
}

// === Highlights ===
export async function listHighlights(bookId: string): Promise<Highlight[]> {
  const items: Highlight[] = [];
  await highlightStore.iterate<Highlight, void>((v) => {
    if (v.bookId === bookId) items.push(v);
  });
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveHighlight(h: Highlight): Promise<void> {
  await highlightStore.setItem(h.id, h);
  await touchSync();
}

export async function deleteHighlight(id: string): Promise<void> {
  await highlightStore.removeItem(id);
  await touchSync();
}

// === Simplifications ===
export async function listSimplifications(bookId: string): Promise<Simplification[]> {
  const items: Simplification[] = [];
  await simplificationStore.iterate<Simplification, void>((v) => {
    if (v.bookId === bookId) items.push(v);
  });
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveSimplification(s: Simplification): Promise<void> {
  await simplificationStore.setItem(s.id, s);
  await touchSync();
}

// === Settings ===
const SETTINGS_KEY = 'reader-settings';

export const defaultSettings: ReaderSettings = {
  theme: 'light',
  fontFamily: 'serif',
  fontSize: 18,
  lineHeight: 1.6,
  letterSpacing: 0,
  margin: 12,
  pageMode: 'paginated',
  spreadView: false,
  justifyText: false,
  hyphenate: false,
  speedReadingMode: 'off',
  speedReadingWpm: 300,
  guideCentered: false,
};

export async function loadSettings(): Promise<ReaderSettings> {
  const v = (await settingsStore.getItem(SETTINGS_KEY)) as ReaderSettings | null;
  return { ...defaultSettings, ...(v ?? {}) };
}

export async function saveSettings(s: ReaderSettings): Promise<void> {
  await settingsStore.setItem(SETTINGS_KEY, s);
}

// === Sync (cross-device export/import) ===
export interface SyncBundle {
  version: number;
  exportedAt: number;
  books: BookMeta[];
  bookmarks: Bookmark[];
  highlights: Highlight[];
  simplifications: Simplification[];
  settings: ReaderSettings;
}

export async function exportBundle(): Promise<SyncBundle> {
  const books: BookMeta[] = [];
  await bookStore.iterate<BookMeta, void>((v) => books.push(v));
  const bookmarks: Bookmark[] = [];
  await bookmarkStore.iterate<Bookmark, void>((v) => bookmarks.push(v));
  const highlights: Highlight[] = [];
  await highlightStore.iterate<Highlight, void>((v) => highlights.push(v));
  const simplifications: Simplification[] = [];
  await simplificationStore.iterate<Simplification, void>((v) => simplifications.push(v));
  const settings = await loadSettings();
  return {
    version: 1,
    exportedAt: Date.now(),
    books,
    bookmarks,
    highlights,
    simplifications,
    settings,
  };
}

export async function importBundle(bundle: SyncBundle): Promise<void> {
  for (const b of bundle.books) await bookStore.setItem(b.id, b);
  for (const b of bundle.bookmarks) await bookmarkStore.setItem(b.id, b);
  for (const h of bundle.highlights) await highlightStore.setItem(h.id, h);
  for (const s of bundle.simplifications) await simplificationStore.setItem(s.id, s);
  await settingsStore.setItem(SETTINGS_KEY, bundle.settings);
  await touchSync();
}

async function touchSync() {
  await syncStore.setItem('lastModified', Date.now());
}

export async function getLastModified(): Promise<number | null> {
  return (await syncStore.getItem('lastModified')) as number | null;
}

// === Cross-library search ===
export async function searchAcrossLibrary(query: string): Promise<
  { bookId: string; title: string; author: string; snippet: string; cfi?: string }[]
> {
  const books = await listBooks();
  const results: { bookId: string; title: string; author: string; snippet: string; cfi?: string }[] = [];
  const q = query.trim().toLowerCase();
  if (!q) return results;
  for (const b of books) {
    const file = await getBookFile(b.id);
    if (!file) continue;
    // For EPUB: try to extract spine text via a lightweight search
    try {
      const text = await import('./ebook/search').then((m) => m.extractPlainText(b, file));
      const idx = text.toLowerCase().indexOf(q);
      if (idx >= 0) {
        const start = Math.max(0, idx - 80);
        const end = Math.min(text.length, idx + q.length + 80);
        results.push({
          bookId: b.id,
          title: b.title,
          author: b.author,
          snippet: (start > 0 ? '… ' : '') + text.slice(start, end) + (end < text.length ? ' …' : ''),
        });
      }
    } catch {
      // ignore
    }
  }
  return results;
}
