'use client';

import { useEffect, useRef, useState } from 'react';
import ePub, { type Book, type Rendition, type Contents } from 'epubjs';
import type { BookMeta, ReaderSettings, Highlight } from '@/lib/types';
import type { ReaderHandle, Annotation } from './reader-pane';
import * as storage from '@/lib/storage';
import { SelectionPopover } from './selection-popover';
import { toast } from 'sonner';
import { makeId } from '@/lib/ebook/loader';
import { computeSentenceContext } from '@/lib/reader/sentence';
import { useReaderProgressStore } from '@/stores/reader-progress-store';

interface Props {
  book: BookMeta;
  data: ArrayBuffer;
  settings: ReaderSettings;
  onProgress: (cfi: string, percent: number) => void;
  onReady: (h: ReaderHandle | null) => void;
  onError: (msg: string) => void;
  slot: 'primary' | 'secondary';
}

export function EpubReader({ book, data, settings, onProgress, onReady, onError, slot }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [toc, setToc] = useState<{ label: string; href: string; level: number }[]>([]);
  const [selection, setSelection] = useState<{
    text: string;
    before: string;
    after: string;
    cfiRange: string;
    rect: DOMRect;
  } | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [ready, setReady] = useState(false);

  // Store a reference to the chapter-resolver function so addHighlight can
  // look up the chapter for a given CFI without needing the full handle.
  const getChapterForCfiRef = useRef<((cfi: string) => string) | null>(null);

  // Theme application
  useEffect(() => {
    if (!renditionRef.current) return;
    applyTheme(renditionRef.current, settings);
  }, [settings]);

  // Init epub.js
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    const init = async () => {
      try {
        // Wait for the container to be laid out so epub.js can measure
        // its real dimensions. Without this, the iframe ends up at height 0.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (destroyed || !containerRef.current) return;

        const epub = ePub(data);
        bookRef.current = epub;
        await epub.ready;
        if (destroyed) {
          epub.destroy();
          return;
        }
        // Measure container dimensions explicitly
        const rect = containerRef.current.getBoundingClientRect();
        const w = Math.max(320, Math.floor(rect.width || 800));
        const h = Math.max(320, Math.floor(rect.height || 600));
        // Two-page (spread) view: when enabled AND the viewport is wide
        // enough (>= 800px), epub.js renders two pages side by side like an
        // open book. On narrower screens we fall back to single-page even if
        // the user has spreadView enabled, so we never force horizontal
        // scrolling.
        const wideEnough = w >= 800;
        const useSpread = settings.spreadView && wideEnough && settings.pageMode === 'paginated';
        const spread = useSpread ? 'both' : 'none';
        const minSpreadWidth = useSpread ? 400 : 0;
        const rendition = epub.renderTo(containerRef.current!, {
          width: w,
          height: h,
          flow: settings.pageMode === 'scroll' ? 'scrolled-doc' : 'paginated',
          manager: 'default',
          spread,
          minSpreadWidth,
        });
        renditionRef.current = rendition;
        // Register & select theme BEFORE display so epub.js applies it
        // automatically when each view's contents load. Calling select()
        // before any views exist is safe (apply iterates an empty list).
        try {
          rendition.themes.register('custom', themeObjectFor(settings));
          rendition.themes.select('custom');
        } catch (e) {
          console.warn('initial theme registration failed', e);
        }

        // Restore location if present
        const startCfi = book.location && isValidCfi(book.location) ? book.location : undefined;
        await rendition.display(startCfi ?? undefined);

        // Re-apply theme whenever a new view renders (e.g., page turn).
        rendition.on('rendered', () => {
          try {
            rendition.themes.select('custom');
          } catch {
            // contents not ready yet; will retry on next 'rendered'
          }
        });

        // TOC
        const nav = await epub.loaded.navigation;
        const flat: { label: string; href: string; level: number }[] = [];
        const walk = (items: typeof nav.toc, level: number) => {
          for (const it of items) {
            flat.push({ label: it.label.trim() || '(untitled)', href: it.href, level });
            if (it.subitems?.length) walk(it.subitems, level + 1);
          }
        };
        walk(nav.toc, 0);
        setToc(flat);

        // Selection handler.
        // epub.js fires 'selected' with whatever range the browser produced.
        // We use the user's EXACT selection (no snapping, no replacement of
        // the visible highlight). We only QUIETLY compute the sentence
        // before and after for AI context.
        // The popup position is computed by adding the iframe's on-page
        // offset (win.frameElement.getBoundingClientRect()) to the range's
        // bounding rect — otherwise the popup appears in the wrong spot.
        rendition.on('selected', (cfiRange: string, contents: Contents) => {
          try {
            const win = contents.window;
            const doc = contents.document;
            const sel = win.getSelection();
            if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            const body = doc.body;
            if (!body) return;

            const text = sel.toString();
            if (!text.trim()) return;

            // Compute before/after sentence context quietly (does NOT
            // modify the visible selection).
            const ctx = computeSentenceContext(range, body);

            // The range's bounding rect is in the IFRAME's coordinate
            // space. To position the popup correctly on the parent page,
            // we must add the iframe's own on-page offset.
            const rangeRect = range.getBoundingClientRect();
            let top = rangeRect.top;
            let left = rangeRect.left;
            try {
              const frameEl = win.frameElement;
              if (frameEl) {
                const frameRect = frameEl.getBoundingClientRect();
                top += frameRect.top;
                left += frameRect.left;
              }
            } catch {
              // ignore
            }
            const offsetRect = new DOMRect(left, top, rangeRect.width, rangeRect.height);

            setSelection({
              text,
              before: ctx.before,
              after: ctx.after,
              cfiRange,
              rect: offsetRect,
            });
          } catch (e) {
            console.error('selection error', e);
          }
        });

        // Build a cached map from spine index → chapter label ONCE.
        // This avoids doing a TOC lookup (O(n) string matching) on every
        // single page turn in the relocated handler.
        const spineToChapter = new Map<number, string>();
        const spineItemsArr = epub.spine.items || [];
        for (let i = 0; i < spineItemsArr.length; i++) {
          const item = spineItemsArr[i];
          const href = item?.href || '';
          const tocEntry = flat.find((t) => href.endsWith(t.href) || t.href.endsWith(href) || href === t.href);
          if (tocEntry) {
            spineToChapter.set(i, tocEntry.label);
          }
        }

        // Cache total book pages once locations are generated; updated by
        // the locations.generate() callback below.
        let cachedBookTotalPages = 0;
        try {
          // @ts-expect-error: locations is on the book but not in all type defs
          cachedBookTotalPages = epub.locations?.total || 0;
        } catch {
          // ignore
        }

        // Location tracking — publishes BOTH whole-book progress (primary)
        // and current-chapter progress (secondary) to the progress store.
        // This handler fires on every page turn, so it must be FAST.
        rendition.on('relocated', (location: {
          start: {
            cfi: string;
            percentage?: number;
            displayed?: { page?: number; total?: number };
          };
          end?: {
            cfi: string;
            displayed?: { page?: number; total?: number };
            percentage?: number;
          };
        }) => {
          const cfi = location?.start?.cfi;
          const bookPct = location?.start?.percentage ?? 0;
          if (cfi) onProgress(cfi, bookPct);

          // --- Current-chapter progress (secondary) ---
          const chapterTotalPages = location?.start?.displayed?.total ?? 0;
          const endPage = location?.end?.displayed?.page ?? location?.start?.displayed?.page ?? 0;
          const chapterPagesLeft = Math.max(0, chapterTotalPages - endPage);
          const chapterProgress = chapterTotalPages > 0 ? endPage / chapterTotalPages : 0;

          // --- Whole-book progress (primary) ---
          let bookTotalPages = cachedBookTotalPages;
          if (!bookTotalPages) {
            // Estimate until locations.generate() completes.
            const spineCount = epub.spine?.length || 1;
            const avgPagesPerSpine = chapterTotalPages > 0 ? chapterTotalPages : 1;
            bookTotalPages = Math.max(spineCount, spineCount * avgPagesPerSpine);
          }
          const bookPage = Math.max(1, Math.min(bookTotalPages, Math.round(bookPct * bookTotalPages) || 1));
          const bookPagesLeft = Math.max(0, bookTotalPages - bookPage);

          // --- Chapter label (cached lookup, O(1)) ---
          let chapterLabel = '';
          try {
            const spineItem = epub.spine.get(cfi);
            if (spineItem) {
              const idx = epub.spine.spineItems.indexOf(spineItem);
              if (idx >= 0) {
                chapterLabel = spineToChapter.get(idx) || spineItem.href || '';
              } else {
                // Fallback: scan the cached map by href
                const href = spineItem.href;
                for (const [_, label] of spineToChapter) {
                  void _;
                  // We can't reverse-lookup by href from the map, so just
                  // use the spineItem.href as the label.
                  break;
                }
                chapterLabel = href;
              }
            }
          } catch {
            // ignore
          }

          useReaderProgressStore.getState().set({
            bookProgress: bookPct,
            bookPage,
            bookTotalPages,
            bookPagesLeft,
            chapterProgress,
            chapterPagesLeft,
            chapterLabel,
          });
        });

        // Generate chapter boundary markers ONCE (not on every page turn).
        try {
          const totalSpine = spineItemsArr.length || 1;
          const markers: { label: string; at: number }[] = [];
          spineToChapter.forEach((label, idx) => {
            markers.push({ label, at: idx / totalSpine });
          });
          if (markers.length > 0) {
            useReaderProgressStore.getState().set({ chapterMarkers: markers });
          }
        } catch {
          // ignore — markers are non-critical
        }

        // Generate locations in the background for accurate whole-book page
        // counts. This runs once; when it completes we update the cached
        // total and publish the accurate numbers.
        try {
          // @ts-expect-error: generate is on locations but not in all type defs
          if (epub.locations && typeof epub.locations.generate === 'function') {
            epub.locations.generate(1024).then(() => {
              // @ts-expect-error: locations.total is available after generate
              cachedBookTotalPages = epub.locations?.total || 0;
              if (cachedBookTotalPages > 0) {
                const loc = rendition.currentLocation();
                const pct = loc?.start?.percentage ?? 0;
                const bookPage = Math.max(1, Math.min(cachedBookTotalPages, Math.round(pct * cachedBookTotalPages) || 1));
                useReaderProgressStore.getState().set({
                  bookTotalPages: cachedBookTotalPages,
                  bookPage,
                  bookPagesLeft: Math.max(0, cachedBookTotalPages - bookPage),
                });
              }
            }).catch(() => { /* ignore */ });
          }
        } catch {
          // ignore
        }

        // Load existing highlights
        const hls = await storage.listHighlights(book.id);
        const anns: Annotation[] = hls.map((h) => ({ cfiRange: h.cfiRange, color: h.color, note: h.note }));
        setAnnotations(anns);
        for (const h of hls) {
          try {
            rendition.annotations.add('highlight', h.cfiRange, { color: h.color, fill: colorFor(h.color) }, undefined, `hl-${h.id}`, { fill: colorFor(h.color) });
          } catch {
            // ignore
          }
        }

        // Expose reader handle
        const handle: ReaderHandle = {
          next: () => rendition.next(),
          prev: () => rendition.prev(),
          getCurrentCfi: () => {
            const loc = rendition.currentLocation();
            return loc?.start?.cfi;
          },
          setCfi: (cfi: string) => {
            rendition.display(cfi);
          },
          getSelectionContext: () => {
            if (!selection) return null;
            return { text: selection.text, before: selection.before, after: selection.after, cfiRange: selection.cfiRange };
          },
          searchInBook: async (q: string) => {
            const results = await Promise.all(epub.spine.spineItems.map(async (item) => {
              if (!item.load) return [];
              await item.load(epub.load.bind(epub));
              const doc = item.document as Document;
              const found: { cfi: string; excerpt: string }[] = [];
              const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
              let node: Node | null = walker.nextNode();
              while (node) {
                const text = node.textContent || '';
                const idx = text.toLowerCase().indexOf(q.toLowerCase());
                if (idx >= 0) {
                  const start = Math.max(0, idx - 40);
                  const end = Math.min(text.length, idx + q.length + 40);
                  const range = doc.createRange();
                  range.setStart(node, idx);
                  range.setEnd(node, idx + q.length);
                  const cfi = item.cfiFromRange(range);
                  found.push({ cfi, excerpt: text.slice(start, end) });
                }
                node = walker.nextNode();
              }
              return found;
            }));
            return results.flat();
          },
          goToCfi: (cfi: string) => rendition.display(cfi),
          getToc: () => flat,
          goToTocItem: (href: string) => {
            const spineItem = epub.spine.get(href);
            if (spineItem) rendition.display(href);
          },
          bookmarkCurrent: async (label?: string) => {
            const loc = rendition.currentLocation();
            const cfi = loc?.start?.cfi;
            if (!cfi) return;
            const bm = {
              id: makeId(),
              bookId: book.id,
              cfiRange: cfi,
              label: label || `Bookmark at ${Math.round((loc?.start?.percentage ?? 0) * 100)}%`,
              createdAt: Date.now(),
              progress: loc?.start?.percentage ?? 0,
            };
            await storage.saveBookmark(bm);
            // No success notification — bookmark is saved silently.
          },
          applyAnnotations: () => {
            // re-apply annotations after a theme reload
            // (epub.js handles this automatically; kept for API compatibility)
          },
          getChapterForCfi: (cfi: string): string => {
            try {
              const spineItem = epub.spine.get(cfi);
              if (!spineItem) return '';
              const idx = epub.spine.spineItems.indexOf(spineItem);
              if (idx >= 0) {
                return spineToChapter.get(idx) || spineItem.href || '';
              }
              return spineItem.href || '';
            } catch {
              return '';
            }
          },
          getChapterText: async (cfi: string): Promise<string> => {
            try {
              const spineItem = epub.spine.get(cfi);
              if (!spineItem) return '';
              await spineItem.load(epub.load.bind(epub));
              const doc = spineItem.document as Document;
              const text = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
              spineItem.unload();
              return text;
            } catch {
              return '';
            }
          },
          displayCfi: (cfi: string) => {
            rendition.display(cfi);
          },
        };
        onReady(handle);

        // Store the chapter resolver for use by addHighlight
        getChapterForCfiRef.current = handle.getChapterForCfi!;

        // Register global toc/search helpers for panels
        if (slot === 'primary') {
          (window as unknown as { __readerToc?: typeof flat }).__readerToc = flat;
          (window as unknown as { __readerGoToToc?: (href: string) => void }).__readerGoToToc = (href: string) => {
            rendition.display(href);
          };
          (window as unknown as { __readerSearch?: (q: string) => Promise<{ cfi: string; excerpt: string }[]> }).__readerSearch = handle.searchInBook!;
          (window as unknown as { __readerGoToCfi?: (cfi: string) => void }).__readerGoToCfi = (cfi: string) => rendition.display(cfi);
          (window as unknown as { __readerBookmarkCurrent?: () => Promise<void> }).__readerBookmarkCurrent = handle.bookmarkCurrent!;
        }

        setReady(true);
      } catch (e) {
        console.error('epub init error', e);
        onError(e instanceof Error ? e.message : 'Failed to open EPUB');
      }
    };

    init();

    // Handle container resize (window resize, split-view drag, etc.)
    const onResize = () => {
      const r = renditionRef.current;
      const el = containerRef.current;
      if (!r || !el) return;
      // Skip if rendition has been destroyed (no manager)
      if (!(r as unknown as { manager?: unknown }).manager) return;
      const rect = el.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width || 800));
      const h = Math.max(320, Math.floor(rect.height || 600));
      try {
        r.resize(w, h);
      } catch (e) {
        // rendition may be tearing down; safe to ignore
      }
    };
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(onResize, 80);
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      destroyed = true;
      ro.disconnect();
      try {
        renditionRef.current?.destroy();
      } catch {
        // ignore
      }
      try {
        bookRef.current?.destroy();
      } catch {
        // ignore
      }
      renditionRef.current = null;
      bookRef.current = null;
    };
    // Re-initialize when spreadView changes (epub.js reads the spread setting
    // at renderTo() time, so toggling requires a fresh rendition).
  }, [data, settings.spreadView]);

  // Re-flow when page mode changes
  useEffect(() => {
    if (!renditionRef.current || !bookRef.current) return;
    const cur = renditionRef.current.currentLocation()?.start?.cfi;
    renditionRef.current.flow(settings.pageMode === 'scroll' ? 'scrolled-doc' : 'paginated');
    if (cur) renditionRef.current.display(cur);
  }, [settings.pageMode]);

  // Note: spread view is handled by the init effect re-running when
  // settings.spreadView changes (epub.js reads spread at renderTo time).

  // Reload on book change
  useEffect(() => {
    // The init effect already runs on data change.
  }, [book.id]);

  // Click anywhere outside the popover/panels to dismiss.
  // This includes clicks INSIDE the epub.js iframe (which is a separate
  // document and doesn't propagate events to the parent window).
  useEffect(() => {
    if (!selection) return;
    const dismiss = () => setSelection(null);
    const isInsidePopup = (target: Node): boolean => {
      // Toolbar
      const popover = document.getElementById('selection-popover');
      if (popover && popover.contains(target)) return true;
      // Result panels (simplify / translate)
      const panels = document.querySelectorAll(
        '[role="region"][aria-label="Simplified sentence"], [role="region"][aria-label="Translation"]',
      );
      for (const p of panels) {
        if (p.contains(target)) return true;
      }
      // Open dropdown menus (highlight color picker) and note popover
      const dropdowns = document.querySelectorAll('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]');
      for (const d of dropdowns) {
        if (d.contains(target)) return true;
      }
      return false;
    };
    const onParentClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (isInsidePopup(target)) return;
      dismiss();
    };
    // Parent window
    window.addEventListener('mousedown', onParentClick);
    // Iframe(s) — epub.js renders content in an iframe; clicks there don't
    // bubble to the parent window, so we attach listeners to each iframe's
    // document as well.
    const iframes = Array.from(document.querySelectorAll('iframe'));
    const iframeCleanups: (() => void)[] = [];
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument;
        if (!doc) continue;
        const onIframeClick = (e: MouseEvent) => {
          const target = e.target as Node;
          if (isInsidePopup(target)) return;
          dismiss();
        };
        doc.addEventListener('mousedown', onIframeClick);
        iframeCleanups.push(() => doc.removeEventListener('mousedown', onIframeClick));
      } catch {
        // cross-origin; skip
      }
    }
    return () => {
      window.removeEventListener('mousedown', onParentClick);
      iframeCleanups.forEach((fn) => fn());
    };
  }, [selection]);

  // Highlight save handler
  const addHighlight = async (color: Highlight['color']) => {
    if (!selection) return;
    const cfiRange = selection.cfiRange;
    try {
      renditionRef.current?.annotations.add('highlight', cfiRange, {}, undefined, `hl-${cfiRange}`, { fill: colorFor(color) });
    } catch (e) {
      console.warn(e);
    }
    // Determine the chapter name from the ACTUAL location of the highlighted
    // text (the start of the selection), not the chapter being viewed.
    let chapterName = '';
    try {
      if (getChapterForCfiRef.current) {
        chapterName = getChapterForCfiRef.current(cfiRange) || '';
      }
    } catch {
      // ignore
    }
    const hl: Highlight = {
      id: makeId(),
      bookId: book.id,
      cfiRange,
      text: selection.text,
      color,
      note: '',
      createdAt: Date.now(),
      chapter: chapterName,
      beforeText: selection.before,
      afterText: selection.after,
    };
    await storage.saveHighlight(hl);
    setAnnotations((a) => [...a, { cfiRange, color, note: '' }]);
    setSelection(null);
    // No success notification — highlight is visible on the page.
  };

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        className="h-full w-full reader-frame"
        role="document"
        aria-label={`Reading ${book.title}`}
      />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="text-sm text-muted-foreground">Preparing reader…</div>
        </div>
      )}
      {selection && (
        <SelectionPopover
          rect={selection.rect}
          text={selection.text}
          before={selection.before}
          after={selection.after}
          bookId={book.id}
          cfiRange={selection.cfiRange}
          onClose={() => setSelection(null)}
          onHighlight={addHighlight}
          onAnnotation={(cfiRange, kind) => {
            if (kind === 'simplify') {
              try {
                renditionRef.current?.annotations.add(
                  'highlight',
                  cfiRange,
                  {},
                  undefined,
                  `simplify-${cfiRange}`,
                  { fill: 'rgba(255, 155, 107, 0.32)' },
                );
              } catch (e) {
                console.warn(e);
              }
            }
          }}
        />
      )}
    </div>
  );
}

function themeObjectFor(s: ReaderSettings) {
  const themes = {
    light: { bg: '#ffffff', fg: '#1f2328' },
    dark: { bg: '#121316', fg: '#d6d6d6' },
    sepia: { bg: '#f4ecd8', fg: '#5b4636' },
    ambient: { bg: '#1a1d2b', fg: '#d8d2c0' },
  };
  const t = themes[s.theme] ?? themes.light;
  return {
    body: {
      background: t.bg,
      color: t.fg,
      'font-family': fontFamilyCss(s.fontFamily),
      'font-size': `${s.fontSize}px`,
      'line-height': String(s.lineHeight),
      'letter-spacing': `${s.letterSpacing}px`,
      padding: `0 ${s.margin}%`,
      'text-align': s.justifyText ? 'justify' : 'left',
      'hyphens': s.hyphenate ? 'auto' : 'manual',
      // When epub.js activates spread mode it sets column-count:2 on the
      // body. A generous column-gap creates the visual "spine" between the
      // two pages of the open book.
      'column-gap': '48px',
    },
    a: { color: 'inherit' },
    p: { 'margin-bottom': '0.8em' },
    'p, li': { 'text-align': s.justifyText ? 'justify' : 'left' },
  };
}

function applyTheme(rendition: Rendition, s: ReaderSettings) {
  try {
    rendition.themes.register('custom', themeObjectFor(s));
  } catch {
    // ignore duplicate registration
  }
  try {
    rendition.themes.select('custom');
  } catch (e) {
    // themes.select can fail before any view is attached; safe to ignore.
    console.warn('themes.select deferred', e);
  }
}

function fontFamilyCss(f: string): string {
  switch (f) {
    case 'serif': return 'Georgia, "Noto Serif", "Source Han Serif", serif';
    case 'sans': return 'system-ui, "Noto Sans", "Helvetica Neue", sans-serif';
    case 'mono': return '"JetBrains Mono", Menlo, Consolas, monospace';
    default: return f;
  }
}

function colorFor(c: string): string {
  switch (c) {
    case 'yellow': return 'rgba(255, 220, 100, 0.55)';
    case 'green': return 'rgba(170, 240, 170, 0.55)';
    case 'blue': return 'rgba(150, 200, 255, 0.55)';
    case 'pink': return 'rgba(255, 170, 200, 0.55)';
    case 'purple': return 'rgba(200, 150, 255, 0.55)';
    default: return 'rgba(255, 220, 100, 0.55)';
  }
}

function isValidCfi(s: string): boolean {
  return typeof s === 'string' && s.startsWith('epubcfi(');
}
