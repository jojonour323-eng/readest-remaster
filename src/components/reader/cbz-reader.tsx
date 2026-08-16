'use client';

import { useEffect, useRef, useState } from 'react';
import type { BookMeta, ReaderSettings } from '@/lib/types';
import type { ReaderHandle } from './reader-pane';
import { loadCbz, type CbzPage } from '@/lib/ebook/cbz';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useReaderProgressStore } from '@/stores/reader-progress-store';
import { toast } from 'sonner';

interface Props {
  book: BookMeta;
  data: ArrayBuffer;
  settings: ReaderSettings;
  onProgress: (cfi: string, percent: number) => void;
  onReady: (h: ReaderHandle | null) => void;
  onError: (msg: string) => void;
  slot: 'primary' | 'secondary';
}

export function CbzReader({ book, data, settings, onProgress, onReady, onError, slot }: Props) {
  const [pages, setPages] = useState<CbzPage[]>([]);
  const [index, setIndex] = useState(0);
  const pagesRef = useRef<CbzPage[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ps = await loadCbz(data);
        if (cancelled) {
          ps.forEach((p) => URL.revokeObjectURL(p.url));
          return;
        }
        setPages(ps);
        pagesRef.current = ps;
        // Restore
        if (book.location && book.location.startsWith('cbz:')) {
          const idx = parseInt(book.location.slice(5), 10);
          if (!Number.isNaN(idx) && idx >= 0 && idx < ps.length) setIndex(idx);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load CBZ';
        onError(msg);
      }
    })();
    return () => {
      cancelled = true;
      pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    };
     
  }, [data]);

  useEffect(() => {
    if (pages.length === 0) return;
    const bookProgress = pages.length > 1 ? index / (pages.length - 1) : 0;
    onProgress(`cbz:${index}`, bookProgress);
    // Publish to the progress store for the bottom progress bar.
    // For comics, the whole book IS the chapter (no chapter markers).
    useReaderProgressStore.getState().set({
      bookProgress,
      bookPage: index + 1,
      bookTotalPages: pages.length,
      bookPagesLeft: Math.max(0, pages.length - 1 - index),
      chapterMarkers: [],
      chapterProgress: bookProgress,
      chapterPagesLeft: Math.max(0, pages.length - 1 - index),
      chapterLabel: 'Comic',
    });
  }, [index, pages, onProgress]);

  useEffect(() => {
    const handle: ReaderHandle = {
      next: () => setIndex((i) => Math.min(pages.length - 1, i + 1)),
      prev: () => setIndex((i) => Math.max(0, i - 1)),
      getCurrentCfi: () => `cbz:${index}`,
      setCfi: (cfi: string) => {
        if (cfi.startsWith('cbz:')) {
          const i = parseInt(cfi.slice(5), 10);
          if (!Number.isNaN(i)) setIndex(i);
        }
      },
      getSelectionContext: () => null,
      searchInBook: async () => [],
      goToCfi: (cfi: string) => {
        if (cfi.startsWith('cbz:')) setIndex(parseInt(cffi(cfi), 10) || 0);
      },
      getToc: () => pages.map((p, i) => ({ label: `Page ${i + 1}`, href: `cbz:${i}`, level: 0 })),
      goToTocItem: (href: string) => {
        if (href.startsWith('cbz:')) setIndex(parseInt(href.slice(5), 10) || 0);
      },
      bookmarkCurrent: async (label?: string) => {
        const { saveBookmark } = await import('@/lib/storage');
        const { makeId } = await import('@/lib/ebook/loader');
        await saveBookmark({
          id: makeId(),
          bookId: book.id,
          cfiRange: `cbz:${index}`,
          label: label || `Page ${index + 1}`,
          createdAt: Date.now(),
          progress: pages.length > 1 ? index / (pages.length - 1) : 0,
        });
        // No success notification — bookmark is saved silently.
      },
    };
    onReady(handle);
    if (slot === 'primary') {
      (window as unknown as { __readerToc?: ReturnType<ReaderHandle['getToc']> }).__readerToc = handle.getToc!();
      (window as unknown as { __readerGoToToc?: (href: string) => void }).__readerGoToToc = handle.goToTocItem!;
      (window as unknown as { __readerSearch?: (q: string) => Promise<{ cfi: string; excerpt: string }[]> }).__readerSearch = handle.searchInBook!;
      (window as unknown as { __readerGoToCfi?: (cfi: string) => void }).__readerGoToCfi = handle.goToCfi!;
      (window as unknown as { __readerBookmarkCurrent?: () => Promise<void> }).__readerBookmarkCurrent = handle.bookmarkCurrent!;
    }
     
  }, [pages, index, slot]);

  // Keyboard arrows for changing pages
  useEffect(() => {
    if (slot !== 'primary') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(pages.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pages.length, slot]);

  if (pages.length === 0) {
    return <div className="h-full grid place-items-center text-muted-foreground">Loading comic…</div>;
  }

  const themeVars: React.CSSProperties = (() => {
    const map: Record<string, string> = {
      light: '#ffffff',
      dark: '#121316',
      sepia: '#f4ecd8',
      ambient: '#1a1d2b',
    };
    return { background: map[settings.theme] ?? '#ffffff' };
  })();

  return (
    <div className="h-full flex flex-col items-center justify-center" style={themeVars}>
      <div className="relative w-full h-full flex items-center justify-center">
        { }
        <img
          src={pages[index].url}
          alt={`Page ${index + 1} of ${pages.length}`}
          className="cbz-page"
        />
        <button
          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white"
          onClick={() => setIndex((i) => Math.min(pages.length - 1, i + 1))}
          disabled={index === pages.length - 1}
          aria-label="Next page"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      <div className="text-xs text-muted-foreground py-1.5" aria-live="polite">
        Page {index + 1} / {pages.length}
      </div>
    </div>
  );
}

function cffi(cfi: string): string {
  return cfi.slice(5);
}
