'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BookMeta, ReaderSettings, Highlight } from '@/lib/types';
import type { ReaderHandle } from './reader-pane';
import * as storage from '@/lib/storage';
import { SelectionPopover } from './selection-popover';
import { toast } from 'sonner';
import { makeId } from '@/lib/ebook/loader';
import { fb2ToHtml, materializeFb2Images } from '@/lib/ebook/fb2';
import { extractMobiHtml } from '@/lib/ebook/mobi';
import { decodeTxt, txtToHtml } from '@/lib/ebook/txt';
import type { HighlightColor } from '@/lib/types';
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

export function HtmlReader({ book, data, settings, onProgress, onReady, onError, slot }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [html, setHtml] = useState<string>('');
  const [toc, setToc] = useState<{ label: string; href: string; level: number }[]>([]);
  const [selection, setSelection] = useState<{
    text: string;
    before: string;
    after: string;
    cfiRange: string;
    rect: DOMRect;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build the HTML content once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let out = '';
        if (book.format === 'fb2') {
          out = fb2ToHtml(data);
          out = await materializeFb2Images(out, data);
        } else if (book.format === 'mobi' || book.format === 'azw3') {
          out = await extractMobiHtml(data);
        } else if (book.format === 'txt') {
          const txt = decodeTxt(data);
          out = txtToHtml(txt);
        }
        if (cancelled) return;
        // Sanitize a bit: strip scripts/styles
        out = out.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
        setHtml(out);
        // Extract TOC from H1/H2/H3
        const tmp = document.createElement('div');
        tmp.innerHTML = out;
        const heads = Array.from(tmp.querySelectorAll('h1, h2, h3'));
        const tocArr: { label: string; href: string; level: number }[] = [];
        heads.forEach((h, i) => {
          const id = h.id || `h-${i}`;
          h.id = id;
          tocArr.push({
            label: h.textContent?.trim() || '(untitled)',
            href: `#${id}`,
            level: h.tagName === 'H1' ? 0 : h.tagName === 'H2' ? 1 : 2,
          });
        });
        setToc(tocArr);
        setHtml(tmp.innerHTML);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load book';
        setError(msg);
        onError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
     
  }, [data, book.format]);

  // Track progress on scroll — publishes BOTH whole-book progress (primary)
  // and current-chapter progress (secondary) to the progress store.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      const pct = max > 0 ? Math.min(1, el.scrollTop / max) : 0;
      onProgress(`html:${Math.round(pct * 1000) / 1000}`, pct);
      // Approximate page info: assume each "page" is one viewport height.
      const pageHeight = el.clientHeight || 1;
      const bookTotalPages = Math.max(1, Math.ceil(el.scrollHeight / pageHeight));
      const bookPage = Math.min(bookTotalPages, Math.floor(el.scrollTop / pageHeight) + 1);
      const bookPagesLeft = Math.max(0, bookTotalPages - bookPage);

      // Find all chapter headings and compute chapter boundaries.
      const headings: { el: HTMLElement; top: number; label: string }[] = [];
      try {
        Array.from(el.querySelectorAll('h1, h2, h3')).forEach((h) => {
          const he = h as HTMLElement;
          headings.push({ el: he, top: he.offsetTop, label: he.textContent?.trim() || '' });
        });
      } catch {
        // ignore
      }

      // Current chapter = the last heading at or above the scroll position.
      let chapterLabel = '';
      let chapterStartTop = 0;
      let chapterEndTop = el.scrollHeight;
      for (let i = 0; i < headings.length; i++) {
        if (headings[i].top - 1 <= el.scrollTop) {
          chapterLabel = headings[i].label;
          chapterStartTop = headings[i].top;
          if (i + 1 < headings.length) chapterEndTop = headings[i + 1].top;
          else chapterEndTop = el.scrollHeight;
        }
      }
      const chapterMax = chapterEndTop - chapterStartTop;
      const chapterScroll = el.scrollTop - chapterStartTop;
      const chapterProgress = chapterMax > 0 ? Math.max(0, Math.min(1, chapterScroll / chapterMax)) : 0;
      const chapterPagesLeft = Math.max(0, Math.ceil((chapterEndTop - el.scrollTop) / pageHeight) - 1);

      // Chapter markers: fractional position of each heading in the whole book.
      const chapterMarkers = headings.map((h) => ({
        label: h.label,
        at: el.scrollHeight > 0 ? h.top / el.scrollHeight : 0,
      }));

      useReaderProgressStore.getState().set({
        bookProgress: pct,
        bookPage,
        bookTotalPages,
        bookPagesLeft,
        chapterMarkers,
        chapterProgress,
        chapterPagesLeft,
        chapterLabel,
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    // Fire once on mount to populate the bar immediately.
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [onProgress, html]);

  // Restore scroll on load
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !html) return;
    if (book.location && book.location.startsWith('html:')) {
      const pct = parseFloat(book.location.slice(5)) || 0;
      el.scrollTop = pct * (el.scrollHeight - el.clientHeight);
    }
  }, [html, book.location]);

  // Selection handler.
  // We use the user's EXACT selection — no snapping, no replacement of the
  // visible highlight. We only QUIETLY compute the sentence before/after for
  // AI context.
  // We do NOT listen on 'selectionchange' (it fires continuously while the
  // user drags, causing jumpy behavior). Instead we process the selection
  // once, on mouseup / touchend / keyup (the events that signal the user
  // has finished selecting).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const processSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      // Must be inside our container
      if (!el.contains(range.commonAncestorContainer)) return;
      const text = sel.toString();
      if (!text.trim()) return;

      // Compute before/after sentence context quietly (does NOT modify
      // the visible selection).
      const ctx = computeSentenceContext(range, el);

      const rect = range.getBoundingClientRect();
      const cfiRange = makeAnchor(range, el);
      setSelection({
        text,
        before: ctx.before,
        after: ctx.after,
        cfiRange,
        rect,
      });
    };

    const onMouseUp = (e: MouseEvent) => {
      // Only react if the mouseup happened inside our container
      if (!el.contains(e.target as Node)) return;
      // Defer slightly so the browser finalizes the selection range
      setTimeout(processSelection, 0);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!el.contains(e.target as Node)) return;
      setTimeout(processSelection, 0);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Shift+arrow keys adjust the selection; process when the user
      // releases the key.
      if (e.shiftKey || e.key === 'Shift') {
        setTimeout(processSelection, 0);
      }
    };

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [html]);

  // Apply theme via inline styles
  const themeVars: React.CSSProperties = useMemo(() => {
    const map: Record<string, { bg: string; fg: string }> = {
      light: { bg: '#ffffff', fg: '#1f2328' },
      dark: { bg: '#121316', fg: '#d6d6d6' },
      sepia: { bg: '#f4ecd8', fg: '#5b4636' },
      ambient: { bg: '#1a1d2b', fg: '#d8d2c0' },
    };
    const t = map[settings.theme] ?? map.light;
    const base: React.CSSProperties = {
      background: t.bg,
      color: t.fg,
      fontFamily: fontFamilyCss(settings.fontFamily),
      fontSize: `${settings.fontSize}px`,
      lineHeight: settings.lineHeight,
      letterSpacing: `${settings.letterSpacing}px`,
      paddingLeft: `${settings.margin}%`,
      paddingRight: `${settings.margin}%`,
      textAlign: settings.justifyText ? 'justify' : 'left',
      hyphens: settings.hyphenate ? 'auto' : 'manual',
    };
    // Two-page (spread) view for the HTML reader: use CSS multi-column layout.
    // Only applies in paginated mode (not scroll).
    if (settings.spreadView && settings.pageMode === 'paginated') {
      base.columnCount = 2;
      base.columnGap = '48px';
      base.columnFill = 'auto';
      // Snap scrolling to column boundaries for cleaner page-turn feel
      base.scrollSnapType = 'x mandatory';
    } else {
      base.columnCount = 1;
    }
    return base;
  }, [settings]);

  // Expose handle
  useEffect(() => {
    if (!html) return;
    const handle: ReaderHandle = {
      next: () => {
        const el = containerRef.current;
        if (!el) return;
        if (settings.pageMode === 'paginated') {
          el.scrollBy({ top: el.clientHeight * 0.92, behavior: 'smooth' });
        } else {
          el.scrollBy({ top: el.clientHeight * 0.85, behavior: 'smooth' });
        }
      },
      prev: () => {
        const el = containerRef.current;
        if (!el) return;
        el.scrollBy({ top: -el.clientHeight * 0.92, behavior: 'smooth' });
      },
      getCurrentCfi: () => {
        const el = containerRef.current;
        if (!el) return undefined;
        const max = el.scrollHeight - el.clientHeight;
        const pct = max > 0 ? el.scrollTop / max : 0;
        return `html:${pct}`;
      },
      setCfi: (cfi: string) => {
        const el = containerRef.current;
        if (!el) return;
        if (cfi.startsWith('html:')) {
          const pct = parseFloat(cfi.slice(5)) || 0;
          el.scrollTop = pct * (el.scrollHeight - el.clientHeight);
        } else if (cfi.startsWith('#')) {
          const target = el.querySelector(cfi) as HTMLElement | null;
          target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
      getSelectionContext: () => {
        if (!selection) return null;
        return { text: selection.text, before: selection.before, after: selection.after, cfiRange: selection.cfiRange };
      },
      searchInBook: async (q: string) => {
        const el = containerRef.current;
        if (!el) return [];
        const lower = q.toLowerCase();
        const results: { cfi: string; excerpt: string }[] = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Node | null = walker.nextNode();
        while (node) {
          const text = node.textContent || '';
          const idx = text.toLowerCase().indexOf(lower);
          if (idx >= 0) {
            const start = Math.max(0, idx - 40);
            const end = Math.min(text.length, idx + q.length + 40);
            results.push({ cfi: `#text-${results.length}`, excerpt: text.slice(start, end) });
          }
          node = walker.nextNode();
        }
        return results;
      },
      goToCfi: (cfi: string) => {
        const el = containerRef.current;
        if (!el) return;
        if (cfi.startsWith('#')) {
          const target = el.querySelector(cfi) as HTMLElement | null;
          target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
      getToc: () => toc,
      goToTocItem: (href: string) => {
        const el = containerRef.current;
        if (!el) return;
        const target = el.querySelector(href) as HTMLElement | null;
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      bookmarkCurrent: async (label?: string) => {
        const el = containerRef.current;
        if (!el) return;
        const max = el.scrollHeight - el.clientHeight;
        const pct = max > 0 ? el.scrollTop / max : 0;
        const bm = {
          id: makeId(),
          bookId: book.id,
          cfiRange: `html:${pct}`,
          label: label || `Bookmark at ${Math.round(pct * 100)}%`,
          createdAt: Date.now(),
          progress: pct,
        };
        await storage.saveBookmark(bm);
        // No success notification — bookmark is saved silently.
      },
      getChapterForCfi: (_cfi: string): string => {
        // For HTML reader, the "cfi" is an anchor like "#h-2" or "html:0.5".
        // We find the heading at or above the current scroll position.
        const el = containerRef.current;
        if (!el) return '';
        const headings = Array.from(el.querySelectorAll('h1, h2, h3'));
        for (let i = headings.length - 1; i >= 0; i--) {
          const h = headings[i] as HTMLElement;
          if (h.offsetTop - 1 <= el.scrollTop) {
            return h.textContent?.trim() || '';
          }
        }
        return '';
      },
      getChapterText: async (_cfi: string): Promise<string> => {
        const el = containerRef.current;
        if (!el) return '';
        return (el.textContent || '').replace(/\s+/g, ' ').trim();
      },
      displayCfi: (cfi: string) => {
        const el = containerRef.current;
        if (!el) return;
        if (cfi.startsWith('#')) {
          const target = el.querySelector(cfi) as HTMLElement | null;
          target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (cfi.startsWith('html:')) {
          const pct = parseFloat(cfi.slice(5)) || 0;
          el.scrollTop = pct * (el.scrollHeight - el.clientHeight);
        }
      },
    };
    onReady(handle);
    if (slot === 'primary') {
      (window as unknown as { __readerToc?: typeof toc }).__readerToc = toc;
      (window as unknown as { __readerGoToToc?: (href: string) => void }).__readerGoToToc = (href: string) => {
        const el = containerRef.current;
        if (!el) return;
        const target = el.querySelector(href) as HTMLElement | null;
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      (window as unknown as { __readerSearch?: (q: string) => Promise<{ cfi: string; excerpt: string }[]> }).__readerSearch = handle.searchInBook!;
      (window as unknown as { __readerGoToCfi?: (cfi: string) => void }).__readerGoToCfi = handle.goToCfi!;
      (window as unknown as { __readerBookmarkCurrent?: () => Promise<void> }).__readerBookmarkCurrent = handle.bookmarkCurrent!;
    }
     
  }, [html, toc, slot]);

  // Dismiss selection on outside click.
  // Clicking anywhere on the book page (outside the popover toolbar, result
  // panels, and open dropdown menus) closes the popup.
  useEffect(() => {
    if (!selection) return;
    const dismiss = () => setSelection(null);
    const isInsidePopup = (target: Node): boolean => {
      const popover = document.getElementById('selection-popover');
      if (popover && popover.contains(target)) return true;
      const panels = document.querySelectorAll(
        '[role="region"][aria-label="Simplified sentence"], [role="region"][aria-label="Translation"]',
      );
      for (const p of panels) {
        if (p.contains(target)) return true;
      }
      const dropdowns = document.querySelectorAll('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]');
      for (const d of dropdowns) {
        if (d.contains(target)) return true;
      }
      return false;
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (isInsidePopup(target)) return;
      dismiss();
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [selection]);

  const addHighlight = async (color: HighlightColor) => {
    if (!selection) return;
    // For HTML reader, wrap the selection in a span with the color class
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const span = document.createElement('span');
        span.className = `hl-${color}`;
        span.dataset.highlightCfi = selection.cfiRange;
        try {
          range.surroundContents(span);
        } catch {
          // surroundContents fails on multi-node selections; fall back to extractContents
          const contents = range.extractContents();
          span.appendChild(contents);
          range.insertNode(span);
        }
        sel.removeAllRanges();
      }
    } catch (e) {
      console.warn(e);
    }
    // Determine chapter name from the actual selection position.
    let chapterName = '';
    try {
      const el = containerRef.current;
      if (el) {
        const headings = Array.from(el.querySelectorAll('h1, h2, h3'));
        // Find the selection's vertical position
        const sel2 = window.getSelection();
        let selTop = el.scrollTop;
        if (sel2 && sel2.rangeCount > 0) {
          const r = sel2.getRangeAt(0).getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          selTop = el.scrollTop + (r.top - elRect.top);
        }
        for (let i = headings.length - 1; i >= 0; i--) {
          const h = headings[i] as HTMLElement;
          if (h.offsetTop - 1 <= selTop) {
            chapterName = h.textContent?.trim() || '';
            break;
          }
        }
      }
    } catch {
      // ignore
    }
    const hl: Highlight = {
      id: makeId(),
      bookId: book.id,
      cfiRange: selection.cfiRange,
      text: selection.text,
      color,
      note: '',
      createdAt: Date.now(),
      chapter: chapterName,
      beforeText: selection.before,
      afterText: selection.after,
    };
    await storage.saveHighlight(hl);
    setSelection(null);
    // No success notification — highlight is visible on the page.
  };

  if (error) {
    return (
      <div className="h-full grid place-items-center p-6 text-center">
        <div className="text-muted-foreground">{error}</div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        className="h-full w-full overflow-y-auto thin-scroll reader-content"
        style={themeVars}
        role="document"
        aria-label={`Reading ${book.title}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
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
        />
      )}
    </div>
  );
}

function fontFamilyCss(f: string): string {
  switch (f) {
    case 'serif': return 'Georgia, "Noto Serif", "Source Han Serif", serif';
    case 'sans': return 'system-ui, "Noto Sans", "Helvetica Neue", sans-serif';
    case 'mono': return '"JetBrains Mono", Menlo, Consolas, monospace';
    default: return f;
  }
}

function makeAnchor(range: Range, container: HTMLElement): string {
  // Best-effort: use the closest element with an id, or compute text offset.
  let node: Node | null = range.startContainer;
  while (node && node !== container) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.id) return `#${el.id}`;
    }
    node = node.parentNode;
  }
  // Fallback: compute character offset from container start
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  let n: Node | null = walker.nextNode();
  while (n) {
    if (n === range.startContainer) {
      return `#offset-${total + range.startOffset}`;
    }
    total += (n.textContent || '').length;
    n = walker.nextNode();
  }
  return '#';
}
