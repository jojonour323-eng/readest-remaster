'use client';

import { useReaderProgressStore } from '@/stores/reader-progress-store';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Thin bar fixed at the very bottom of the reading screen.
 *
 * Layout:
 *   [← prev] [ ────whole-book progress with chapter markers──── ] [next →]
 *            [ Page 142 / 320 · 178 left        12 left in chapter ]
 *
 * The whole-book progress is the PRIMARY indicator (top line).
 * The chapter pages-remaining is SECONDARY (smaller text).
 *
 * The prev/next arrows use the SAME page-turn logic as the reader
 * (via window.__readerHandle), so they work in both single-page and
 * two-page/spread mode without a separate navigation system.
 */
export function BottomProgressBar() {
  const {
    bookProgress,
    bookPage,
    bookTotalPages,
    bookPagesLeft,
    chapterMarkers,
    chapterPagesLeft,
    chapterLabel,
  } = useReaderProgressStore();

  // Don't render until we have real data.
  if (!bookTotalPages) return null;

  const pct = Math.max(0, Math.min(100, bookProgress * 100));

  const onPrev = () => {
    const h = (window as unknown as { __readerHandle?: { prev?: () => void } }).__readerHandle;
    h?.prev?.();
  };
  const onNext = () => {
    const h = (window as unknown as { __readerHandle?: { next?: () => void } }).__readerHandle;
    h?.next?.();
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 backdrop-blur h-9 flex items-center gap-2 px-2 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
      aria-label={`Page ${bookPage} of ${bookTotalPages}. ${bookPagesLeft} pages left in the book.${chapterPagesLeft > 0 ? ` ${chapterPagesLeft} pages left in ${chapterLabel || 'this chapter'}.` : ''}`}
    >
      {/* Prev arrow */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={onPrev}
        aria-label="Previous page"
        title="Previous page"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      {/* Progress area */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {/* Top line: whole-book progress bar with chapter markers */}
        <div className="relative h-1.5 rounded-full bg-muted overflow-visible">
          {/* Filled portion */}
          <div
            className="absolute left-0 top-0 bottom-0 rounded-full bg-primary"
            style={{ width: `${pct}%` }}
          />
          {/* Chapter boundary markers */}
          {chapterMarkers.map((m, i) => {
            // Skip a marker at position 0 (book start) — it's implicit.
            if (m.at <= 0.001) return null;
            const left = Math.max(0, Math.min(100, m.at * 100));
            return (
              <div
                key={i}
                className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-foreground/40"
                style={{ left: `${left}%` }}
                title={m.label}
                aria-hidden="true"
              />
            );
          })}
          {/* Current position indicator (a small dot at the leading edge) */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary border border-background"
            style={{ left: `calc(${pct}% - 4px)` }}
            aria-hidden="true"
          />
        </div>

        {/* Bottom line: page numbers — whole-book primary, chapter secondary */}
        <div className="flex items-center justify-between gap-2 leading-none">
          <span className="shrink-0 tabular-nums">
            Page <span className="text-foreground font-medium">{bookPage}</span> / {bookTotalPages}
            <span className="mx-1.5 text-muted-foreground/60">·</span>
            <span className="text-foreground font-medium">{bookPagesLeft}</span> left
          </span>
          {chapterPagesLeft > 0 && (
            <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground/80">
              {chapterPagesLeft} left in {chapterLabel || 'chapter'}
            </span>
          )}
        </div>
      </div>

      {/* Next arrow */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={onNext}
        aria-label="Next page"
        title="Next page"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
