'use client';

import { create } from 'zustand';
import type { BookMeta, LibraryFilters } from '@/lib/types';
import * as storage from '@/lib/storage';
import { extractMeta, bookFromFile } from '@/lib/ebook/loader';

interface LibraryState {
  books: BookMeta[];
  loading: boolean;
  filters: LibraryFilters;
  primaryBookId: string | null;

  load: () => Promise<void>;
  addFile: (file: File) => Promise<BookMeta | null>;
  addFromUrl: (url: string, fileName: string, source: 'opds' | 'calibre') => Promise<BookMeta | null>;
  removeBook: (id: string) => Promise<void>;
  updateBook: (id: string, patch: Partial<BookMeta>) => Promise<void>;
  setFilter: <K extends keyof LibraryFilters>(k: K, v: LibraryFilters[K]) => void;
  openBook: (id: string) => void;
  closeReader: () => void;
  filtered: () => BookMeta[];
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  books: [],
  loading: false,
  filters: { search: '', sortBy: 'recent' },
  primaryBookId: null,

  load: async () => {
    set({ loading: true });
    let books = await storage.listBooks();
    // Migration: any book with a stale blob: URL cover (from before the
    // data-URL fix) gets its cover re-extracted from the stored file.
    books = await migrateStaleCovers(books);
    set({ books, loading: false });
  },

  addFile: async (file) => {
    try {
      const buf = await file.arrayBuffer();
      const meta = await extractMeta(buf, file.name);
      const book = bookFromFile(meta, file.name, file.size);
      await storage.saveBookFile(book.id, buf);
      await storage.saveBook(book);
      set({ books: [book, ...get().books] });
      return book;
    } catch (e) {
      console.error('addFile failed', e);
      return null;
    }
  },

  addFromUrl: async (url, fileName, source) => {
    try {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const meta = await extractMeta(buf, fileName);
      const book = bookFromFile(meta, fileName, buf.byteLength);
      book.source = source;
      book.sourceUrl = url;
      await storage.saveBookFile(book.id, buf);
      await storage.saveBook(book);
      set({ books: [book, ...get().books] });
      return book;
    } catch (e) {
      console.error('addFromUrl failed', e);
      return null;
    }
  },

  removeBook: async (id) => {
    await storage.deleteBook(id);
    set({
      books: get().books.filter((b) => b.id !== id),
      primaryBookId: get().primaryBookId === id ? null : get().primaryBookId,
    });
  },

  updateBook: async (id, patch) => {
    const books = get().books;
    const target = books.find((b) => b.id === id);
    if (!target) return;
    const next = { ...target, ...patch };
    await storage.saveBook(next);
    set({ books: books.map((b) => (b.id === id ? next : b)) });
  },

  setFilter: (k, v) => {
    set({ filters: { ...get().filters, [k]: v } });
  },

  openBook: (id) => {
    set({ primaryBookId: id });
  },

  closeReader: () => {
    set({ primaryBookId: null });
  },

  filtered: () => {
    const { books, filters } = get();
    const q = filters.search.trim().toLowerCase();
    let out = books.filter((b) => {
      if (filters.format && b.format !== filters.format) return false;
      if (filters.filterTag && !b.tags.includes(filters.filterTag)) return false;
      if (q) {
        const hay = (b.title + ' ' + b.author + ' ' + b.tags.join(' ')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    out = out.sort((a, b) => {
      switch (filters.sortBy) {
        case 'title': return a.title.localeCompare(b.title);
        case 'author': return a.author.localeCompare(b.author);
        case 'progress': return b.progress - a.progress;
        case 'recent':
        default:
          return (b.lastReadAt ?? b.addedAt) - (a.lastReadAt ?? a.addedAt);
      }
    });
    return out;
  },
}));

// Migrate books with stale blob: URLs in their cover field by re-extracting
// the cover from the stored file and converting to a data URL.
async function migrateStaleCovers(books: BookMeta[]): Promise<BookMeta[]> {
  const patched: BookMeta[] = [];
  for (const b of books) {
    if (!b.cover || !b.cover.startsWith('blob:')) {
      patched.push(b);
      continue;
    }
    try {
      const file = await storage.getBookFile(b.id);
      if (!file) {
        patched.push({ ...b, cover: undefined });
        await storage.saveBook({ ...b, cover: undefined });
        continue;
      }
      const meta = await extractMeta(file, `${b.title}.${b.format}`);
      const next = { ...b, cover: meta.cover };
      await storage.saveBook(next);
      patched.push(next);
    } catch {
      patched.push({ ...b, cover: undefined });
      await storage.saveBook({ ...b, cover: undefined });
    }
  }
  return patched;
}
