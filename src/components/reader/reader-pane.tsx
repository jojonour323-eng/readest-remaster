'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { BookMeta } from '@/lib/types';
import * as storage from '@/lib/storage';
import { useReaderStore } from '@/stores/reader-store';
import { useLibraryStore } from '@/stores/library-store';
import { EpubReader } from './epub-reader';
import { HtmlReader } from './html-reader';
import { CbzReader } from './cbz-reader';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export type ReaderSlot = 'primary' | 'secondary';

interface ReaderPaneProps {
  slot: ReaderSlot;
  bookId: string;
}

export interface ReaderHandle {
  next: () => void;
  prev: () => void;
  getCurrentCfi?: () => string | undefined;
  setCfi?: (cfi: string) => void;
  getSelectionContext?: () => {
    text: string;
    before: string;
    after: string;
    cfiRange?: string;
  } | null;
  searchInBook?: (q: string) => Promise<{ cfi: string; excerpt: string }[]>;
  goToCfi?: (cfi: string) => void;
  getToc?: () => { label: string; href: string; level: number }[];
  goToTocItem?: (href: string) => void;
  bookmarkCurrent?: (label?: string) => Promise<void>;
  applyAnnotations?: (annotations: Annotation[]) => void;
  /** Returns the chapter label for a given CFI, using cached spine→chapter map. */
  getChapterForCfi?: (cfi: string) => string;
  /** Returns the plain text of a chapter (for speed reading). */
  getChapterText?: (cfi: string) => Promise<string>;
  /** Display the chapter at a given CFI (for speed-reading position restore). */
  displayCfi?: (cfi: string) => void;
}

export interface Annotation {
  cfiRange: string;
  color?: string;
  note?: string;
}

export function ReaderPane({ slot, bookId }: ReaderPaneProps) {
  const [book, setBook] = useState<BookMeta | null>(null);
  const [data, setData] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<ReaderHandle | null>(null);

  const settings = useReaderStore((s) => s.settings);
  const updateBook = useLibraryStore((s) => s.updateBook);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meta = await storage.getBook(bookId);
      if (!meta) throw new Error('Book not found in library');
      const file = await storage.getBookFile(bookId);
      if (!file) throw new Error('Book file is missing');
      setBook(meta);
      setData(file);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load book';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    load();
  }, [load]);

  // Persist progress periodically
  // Persist reading progress to the library store. This is debounced so we
  // don't trigger a Zustand update (and re-render the reader tree) on every
  // single page turn — only after the user stops navigating for 500ms.
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onProgress = useCallback(
    (cfi: string, percent: number) => {
      if (!book) return;
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
      progressTimerRef.current = setTimeout(() => {
        updateBook(book.id, {
          progress: Math.max(book.progress ?? 0, percent),
          location: cfi,
          lastReadAt: Date.now(),
        });
      }, 500);
    },
    [book, updateBook],
  );

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, []);

  // Keyboard navigation — attached once. We ignore key repeat (e.repeat)
  // so holding an arrow doesn't fire multiple page turns, and we ignore
  // events when a speed-reading overlay is active (the overlay captures
  // its own keyboard events).
  // We attach to BOTH the parent window AND any epub.js iframes, because
  // when the iframe has focus, keyboard events fire inside the iframe
  // document and don't bubble to the parent window.
  useEffect(() => {
    if (slot !== 'primary') return; // Only primary pane handles global keys
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      // Ignore if the speed-reading overlay is active — it has its own
      // keyboard handler and we don't want double navigation.
      if ((window as unknown as { __speedReadingActive?: boolean }).__speedReadingActive) {
        return;
      }
      // Ignore key repeat to prevent rapid-fire page turns.
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      const h = handleRef.current;
      if (!h) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        h.next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        h.prev();
      }
    };
    // Attach to the parent window
    window.addEventListener('keydown', onKey);
    // Attach to any iframes (epub.js renders content in an iframe; when it
    // has focus, keydown fires inside the iframe).
    const iframes = Array.from(document.querySelectorAll('iframe'));
    const iframeCleanups: (() => void)[] = [];
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument;
        if (!doc) continue;
        doc.addEventListener('keydown', onKey);
        iframeCleanups.push(() => doc.removeEventListener('keydown', onKey));
      } catch {
        // cross-origin; skip
      }
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      iframeCleanups.forEach((fn) => fn());
    };
  }, [slot]);

  // Persist handle to a window-level registry so panels (TOC/Search/Bookmarks) can call it.
  useEffect(() => {
    if (slot !== 'primary') return;
    (window as unknown as { __readerHandle?: ReaderHandle | null }).__readerHandle = handleRef.current;
    return () => {
      if ((window as unknown as { __readerHandle?: ReaderHandle | null }).__readerHandle === handleRef.current) {
        (window as unknown as { __readerHandle?: ReaderHandle | null }).__readerHandle = null;
      }
    };
  }, [slot, handleRef.current]);

  if (loading) {
    return (
      <div className="h-full grid place-items-center reader-frame" aria-busy="true">
        <div className="flex flex-col items-center text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mb-3" />
          <div className="text-sm">Loading book…</div>
        </div>
      </div>
    );
  }

  if (error || !book || !data) {
    return (
      <div className="h-full grid place-items-center reader-frame p-6">
        <div className="flex flex-col items-center text-center max-w-md">
          <AlertCircle className="w-10 h-10 text-destructive mb-3" />
          <div className="font-medium mb-2">Could not open this book</div>
          <div className="text-sm text-muted-foreground mb-4">{error ?? 'Unknown error'}</div>
          <Button onClick={load}>Try again</Button>
        </div>
      </div>
    );
  }

  const setHandle = (h: ReaderHandle | null) => {
    handleRef.current = h;
    if (slot === 'primary') {
      (window as unknown as { __readerHandle?: ReaderHandle | null }).__readerHandle = h;
    }
  };

  const commonProps = {
    book,
    data,
    settings,
    onProgress,
    onReady: setHandle,
    onError: (msg: string) => {
      setError(msg);
      toast.error(msg);
    },
    slot,
  };

  let content: React.ReactNode;
  switch (book.format) {
    case 'epub':
      content = <EpubReader {...commonProps} />;
      break;
    case 'fb2':
    case 'mobi':
    case 'azw3':
    case 'txt':
      content = <HtmlReader {...commonProps} />;
      break;
    case 'cbz':
      content = <CbzReader {...commonProps} />;
      break;
    default:
      content = (
        <div className="h-full grid place-items-center reader-frame p-6 text-center text-muted-foreground">
          Unsupported format: {book.format}
        </div>
      );
  }

  return (
    <div className="relative h-full reader-frame" data-slot={slot} role="document" aria-label={`Reading ${book.title}`}>
      {content}
      {/* Page navigation arrows are now in the bottom progress bar
          (BottomProgressBar) to avoid duplicate controls. */}
    </div>
  );
}
