'use client';

import { useEffect, useRef, useState } from 'react';
import { useReaderStore } from '@/stores/reader-store';
import { useReaderProgressStore } from '@/stores/reader-progress-store';
import { Button } from '@/components/ui/button';
import { X, ChevronRight } from 'lucide-react';

interface TocItem {
  label: string;
  href: string;
  level: number;
}

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 240;
const MAX_WIDTH = 640;
const STORAGE_KEY = 'readest-toc-width';

/**
 * A resizable panel docked on the left side of the reading screen.
 *
 * Lists all chapters (table of contents) of the current book. The user can:
 *  - Open and close it via the TOC button in the top bar.
 *  - Drag the panel's right edge to resize how wide it is (persisted).
 *  - Click a chapter to jump straight to it.
 *
 * The chapter the reader is currently in is highlighted, so they can see
 * their place in the list.
 */
export function ResizableTocPanel() {
  const tocOpen = useReaderStore((s) => s.tocOpen);
  const setPanel = useReaderStore((s) => s.setPanel);
  const chapterLabel = useReaderProgressStore((s) => s.chapterLabel);

  const [items, setItems] = useState<TocItem[]>([]);
  // Lazy-initialize width from localStorage so we don't call setState
  // inside an effect.
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDTH;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const n = parseInt(saved, 10);
      if (!Number.isNaN(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
    return DEFAULT_WIDTH;
  });
  const draggingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Poll the window-level TOC (set by the active reader) so we always have
  // the current book's TOC.
  useEffect(() => {
    let active = true;
    const update = () => {
      if (!active) return;
      const t = (window as unknown as { __readerToc?: TocItem[] }).__readerToc;
      if (t && t.length > 0) setItems(t);
    };
    update();
    const id = setInterval(update, 500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [tocOpen]);

  // Drag-to-resize handlers
  useEffect(() => {
    if (!tocOpen) return;
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      setWidth(newWidth);
    };
    const onMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.localStorage.setItem(STORAGE_KEY, String(width));
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [tocOpen, width]);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };

  const onJump = (href: string) => {
    const go = (window as unknown as { __readerGoToToc?: (href: string) => void }).__readerGoToToc;
    if (go) go(href);
  };

  if (!tocOpen) return null;

  // Determine which TOC item is currently active by matching the chapter
  // label (published by the reader to the progress store).
  const activeLabel = chapterLabel?.trim();

  return (
    <div
      ref={panelRef}
      role="complementary"
      aria-label="Table of contents"
      className="relative h-full border-r bg-background flex flex-col shrink-0"
      style={{ width }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b sticky top-0 bg-background z-10">
        <span className="text-sm font-semibold">Contents</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setPanel('toc', false)}
          aria-label="Close table of contents"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <nav aria-label="Chapters" className="flex-1 overflow-y-auto thin-scroll py-2">
        {items.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            No table of contents available for this book.
          </div>
        ) : (
          <ul className="text-sm">
            {items.map((it, i) => {
              const isActive = !!activeLabel && (
                it.label === activeLabel ||
                activeLabel === it.label ||
                // Substring match for labels like "Chapter 1 — The Arrival"
                // vs toc label "Chapter 1 - The Arrival" (different dash).
                it.label.replace(/[—–-]/g, ' ').trim() === activeLabel.replace(/[—–-]/g, ' ').trim()
              );
              return (
                <li key={i} style={{ paddingLeft: `${it.level * 12 + 8}px` }} className="pr-2">
                  <button
                    className={`w-full text-left py-1.5 px-2 rounded flex items-center gap-1.5 transition-colors ${
                      isActive
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'hover:bg-accent/60'
                    }`}
                    onClick={() => onJump(it.href)}
                    title={it.label}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    {isActive && <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">{it.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Draggable resize handle on the right edge */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize table of contents panel"
        tabIndex={0}
        onMouseDown={startDrag}
        className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 transition-colors"
        style={{ userSelect: 'none' }}
      />
    </div>
  );
}
