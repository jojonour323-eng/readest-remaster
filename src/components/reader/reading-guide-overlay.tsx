'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Gauge,
} from 'lucide-react';
import { useReaderStore } from '@/stores/reader-store';
import type { ReaderHandle } from './reader-pane';

interface Props {
  onClose: () => void;
}

/**
 * Reading Guide speed-reading mode.
 *
 * A thin horizontal line/cursor moves across the actual rendered text lines
 * inside the EPUB iframe at a WPM-controlled speed. The guide follows the
 * real text layout — it does NOT simply animate pixels.
 *
 * How it works:
 *  1. On start (and on page/font/resize changes), we walk the text nodes
 *     inside the iframe body and build a list of "line segments" — each
 *     segment is a {rect, text} pair representing one visual line of text.
 *     We use Range.getClientRects() to get the actual rendered geometry.
 *  2. The animation loop (requestAnimationFrame) advances the guide's
 *     horizontal position along the current line. Speed is derived from
 *     WPM: we estimate words-per-line from the text, then move at
 *     (wordsPerLine / wpm) * 60000 ms per line.
 *  3. When the guide reaches the end of a line, it moves to the next line.
 *  4. When it reaches the bottom of the visible area, we call the reader
 *     handle's next() to page-turn, wait for the new page to render, then
 *     recalculate line geometry and continue.
 *
 * Coordinate handling:
 *  The EPUB reader renders content in an iframe. Line rects from
 *  Range.getClientRects() are in the IFRAME's coordinate space. We add
 *  the iframe's getBoundingClientRect() offset to convert to the parent
 *  document's coordinate space, so the guide overlay (rendered in the
 *  parent) aligns with the text.
 *
 * Stability:
 *  - The animation loop is a single requestAnimationFrame chain, stored
 *    in a ref, and cancelled on cleanup. No duplicate loops.
 *  - Line geometry is cached and only recalculated on start, page change,
 *    font/size/resize changes.
 *  - Page turns pause the guide, navigate, wait for render, recalc, resume.
 *  - Keyboard events use capture phase + the __speedReadingActive flag so
 *    they don't also trigger normal reader navigation.
 *  - Text selection is not blocked; if the user starts selecting, we pause.
 */

interface LineSegment {
  /** Line rect in PARENT document coordinates (already offset by iframe). */
  rect: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  /** The text content of this line (for word-count estimation). */
  text: string;
}

interface WordRect {
  x: number; y: number; right: number; bottom: number;
  height: number;
  text: string;
}

function makeLineSegment(words: WordRect[]): LineSegment {
  const left = Math.min(...words.map((w) => w.x));
  const right = Math.max(...words.map((w) => w.right));
  const top = Math.min(...words.map((w) => w.y));
  const bottom = Math.max(...words.map((w) => w.bottom));
  return {
    rect: { left, top, right, bottom, width: right - left, height: bottom - top },
    text: words.map((w) => w.text).join(' '),
  };
}

export function ReadingGuideOverlay({ onClose }: Props) {
  const settings = useReaderStore((s) => s.settings);
  const setSetting = useReaderStore((s) => s.setSetting);

  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 through current page lines
  const [lineIdx, setLineIdx] = useState(0);
  const [totalLines, setTotalLines] = useState(0);

  // Refs for animation state (avoid re-renders on every frame)
  const linesRef = useRef<LineSegment[]>([]);
  const lineIdxRef = useRef(0);
  const xRef = useRef(0); // current x position within the current line
  const playingRef = useRef(false);
  const wpmRef = useRef(settings.speedReadingWpm);
  const centeredRef = useRef(settings.guideCentered);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const pageTurningRef = useRef(false);
  const handleRef = useRef<ReaderHandle | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const guideElRef = useRef<HTMLDivElement | null>(null);
  const selectingRef = useRef(false);

  // Keep refs in sync with settings
  useEffect(() => { wpmRef.current = settings.speedReadingWpm; }, [settings.speedReadingWpm]);
  useEffect(() => { centeredRef.current = settings.guideCentered; }, [settings.guideCentered]);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  // Set the speed-reading active flag so normal keyboard nav is suppressed.
  useEffect(() => {
    (window as unknown as { __speedReadingActive?: boolean }).__speedReadingActive = true;
    return () => {
      (window as unknown as { __speedReadingActive?: boolean }).__speedReadingActive = false;
    };
  }, []);

  /**
   * Build the list of line segments from the iframe's rendered text.
   * Walks all text nodes in the iframe body, creates ranges for each word,
   * and groups words into lines based on their vertical position.
   */
  const computeLines = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    const body = doc.body;
    if (!body) return;

    // Get the iframe's offset in the parent document
    let frameOffsetX = 0;
    let frameOffsetY = 0;
    try {
      const frameRect = iframe.getBoundingClientRect();
      frameOffsetX = frameRect.left;
      frameOffsetY = frameRect.top;
    } catch {
      // ignore
    }

    // Walk all text nodes and collect word rects
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const t = node.textContent || '';
        return t.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    const wordRects: WordRect[] = [];
    let node: Node | null = walker.nextNode();
    while (node) {
      const textNode = node as Text;
      const text = textNode.textContent || '';
      // Split into words, create a range for each word to get its rect
      const wordRegex = /\S+/g;
      let m: RegExpExecArray | null;
      while ((m = wordRegex.exec(text)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        try {
          const range = doc.createRange();
          range.setStart(textNode, start);
          range.setEnd(textNode, end);
          const rects = range.getClientRects();
          if (rects.length > 0) {
            // Use the first rect (a word usually fits on one line)
            const r = rects[0];
            wordRects.push({
              x: r.left + frameOffsetX,
              y: r.top + frameOffsetY,
              right: r.right + frameOffsetX,
              bottom: r.bottom + frameOffsetY,
              height: r.height,
              text: m[0],
            });
          }
        } catch {
          // ignore range errors
        }
      }
      node = walker.nextNode();
    }

    if (wordRects.length === 0) {
      linesRef.current = [];
      return;
    }

    // Group words into lines based on vertical position.
    // Words on the same line have approximately the same y (within a few px).
    const lines: LineSegment[] = [];
    let currentLine: WordRect[] = [];
    let currentY = wordRects[0].y;
    const yTolerance = Math.max(3, wordRects[0].height * 0.5);

    for (const wr of wordRects) {
      if (Math.abs(wr.y - currentY) <= yTolerance) {
        currentLine.push(wr);
      } else {
        if (currentLine.length > 0) {
          lines.push(makeLineSegment(currentLine));
        }
        currentLine = [wr];
        currentY = wr.y;
      }
    }
    if (currentLine.length > 0) {
      lines.push(makeLineSegment(currentLine));
    }

    linesRef.current = lines;
    setTotalLines(lines.length);
    setReady(lines.length > 0);
  }, []);

  /**
   * Position the guide DOM element at the current line and x position.
   */
  const positionGuide = useCallback(() => {
    const lines = linesRef.current;
    const idx = lineIdxRef.current;
    const guide = guideElRef.current;
    if (!guide || lines.length === 0 || idx >= lines.length) return;
    const line = lines[idx];
    const x = Math.max(line.rect.left, Math.min(line.rect.right, xRef.current));
    guide.style.left = `${x}px`;
    guide.style.top = `${line.rect.top}px`;
    guide.style.height = `${Math.max(2, line.rect.height)}px`;
    guide.style.width = '2px';

    // Update progress
    const pct = lines.length > 0 ? (idx + (x - line.rect.left) / Math.max(1, line.rect.width)) / lines.length : 0;
    setProgress(Math.max(0, Math.min(1, pct)));
    setLineIdx(idx);

    // Centered mode: scroll the iframe's parent container so the line is centered
    if (centeredRef.current && iframeRef.current) {
      const iframe = iframeRef.current;
      // Find the scrollable parent (the reader container)
      const parent = iframe.parentElement;
      if (parent) {
        const targetScroll = line.rect.top - parent.getBoundingClientRect().top - parent.clientHeight / 2 + line.rect.height / 2;
        parent.scrollTop = Math.max(0, targetScroll);
      }
    }
  }, []);

  /**
   * The animation loop. Advances x along the current line, moves to next
   * line when reaching the end, and triggers a page turn at the bottom.
   * Uses a ref so the function can reference itself for recursive
   * requestAnimationFrame calls without creating a dependency cycle.
   */
  const animateRef = useRef<((time: number) => void) | null>(null);
  const animate = useCallback((time: number) => {
    if (!playingRef.current) {
      rafRef.current = null;
      return;
    }
    if (pageTurningRef.current) {
      rafRef.current = requestAnimationFrame((t) => animateRef.current?.(t));
      return;
    }
    const lines = linesRef.current;
    if (lines.length === 0) {
      rafRef.current = requestAnimationFrame((t) => animateRef.current?.(t));
      return;
    }

    const dt = lastTimeRef.current ? (time - lastTimeRef.current) : 16;
    lastTimeRef.current = time;

    const idx = lineIdxRef.current;
    const line = lines[idx];
    if (!line) {
      rafRef.current = requestAnimationFrame((t) => animateRef.current?.(t));
      return;
    }

    // Estimate words on this line, compute px-per-ms based on WPM
    const wordCount = Math.max(1, line.text.split(/\s+/).filter(Boolean).length);
    const lineDurationMs = (wordCount / wpmRef.current) * 60000;
    const pxPerMs = line.rect.width / Math.max(1, lineDurationMs);
    xRef.current += pxPerMs * dt;

    // If past the end of this line, move to next line
    if (xRef.current >= line.rect.right) {
      if (idx + 1 < lines.length) {
        lineIdxRef.current = idx + 1;
        xRef.current = lines[idx + 1].rect.left;
      } else {
        // Reached the end of the last line on this page — page turn
        pageTurningRef.current = true;
        setPlaying(false);
        const h = handleRef.current;
        if (h) {
          h.next();
          setTimeout(() => {
            computeLines();
            lineIdxRef.current = 0;
            const newLines = linesRef.current;
            xRef.current = newLines.length > 0 ? newLines[0].rect.left : 0;
            positionGuide();
            pageTurningRef.current = false;
            setPlaying(true);
          }, 600);
        }
        rafRef.current = requestAnimationFrame((t) => animateRef.current?.(t));
        return;
      }
    }

    positionGuide();
    rafRef.current = requestAnimationFrame((t) => animateRef.current?.(t));
  }, [computeLines, positionGuide]);

  // Keep animateRef in sync
  useEffect(() => { animateRef.current = animate; }, [animate]);

  // Start/stop the animation loop based on `playing`
  useEffect(() => {
    if (playing) {
      lastTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(animate);
    } else {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playing, animate]);

  // Find the iframe and reader handle on mount
  useEffect(() => {
    handleRef.current = (window as unknown as { __readerHandle?: ReaderHandle | null }).__readerHandle ?? null;
    const iframe = document.querySelector('iframe');
    iframeRef.current = iframe as HTMLIFrameElement | null;
    if (iframe) {
      // Wait for the iframe content to load
      setTimeout(() => {
        computeLines();
        if (linesRef.current.length > 0) {
          lineIdxRef.current = 0;
          xRef.current = linesRef.current[0].rect.left;
          positionGuide();
          setReady(true);
        }
      }, 400);
    }
  }, [computeLines, positionGuide]);

  // Recalculate lines when font/size/margin/window changes
  useEffect(() => {
    const recalc = () => {
      computeLines();
      // Clamp current position
      const lines = linesRef.current;
      if (lines.length > 0) {
        if (lineIdxRef.current >= lines.length) lineIdxRef.current = 0;
        const line = lines[lineIdxRef.current];
        xRef.current = Math.max(line.rect.left, Math.min(line.rect.right, xRef.current));
        positionGuide();
      }
    };
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [computeLines, positionGuide]);

  // Recalculate when text settings change (font, size, line height, margin)
  useEffect(() => {
    const timer = setTimeout(() => {
      computeLines();
      if (linesRef.current.length > 0) {
        if (lineIdxRef.current >= linesRef.current.length) lineIdxRef.current = 0;
        const line = linesRef.current[lineIdxRef.current];
        xRef.current = line.rect.left;
        positionGuide();
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [settings.fontSize, settings.lineHeight, settings.letterSpacing, settings.margin, settings.fontFamily, computeLines, positionGuide]);

  // Pause while the user is selecting text
  useEffect(() => {
    const checkSelection = () => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const sel = doc.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
          if (!selectingRef.current) {
            selectingRef.current = true;
            setPlaying(false);
          }
        } else {
          if (selectingRef.current) {
            selectingRef.current = false;
          }
        }
      } catch {
        // ignore
      }
    };
    const interval = setInterval(checkSelection, 300);
    return () => clearInterval(interval);
  }, []);

  // Keyboard controls (capture phase, so they take priority)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        setPlaying((p) => !p);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        // Move to next line
        const lines = linesRef.current;
        if (lines.length > 0) {
          const next = Math.min(lines.length - 1, lineIdxRef.current + 1);
          lineIdxRef.current = next;
          xRef.current = lines[next].rect.left;
          positionGuide();
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        // Move to previous line
        const lines = linesRef.current;
        if (lines.length > 0) {
          const prev = Math.max(0, lineIdxRef.current - 1);
          lineIdxRef.current = prev;
          xRef.current = lines[prev].rect.left;
          positionGuide();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, positionGuide]);

  const handleRestart = useCallback(() => {
    setPlaying(false);
    const lines = linesRef.current;
    if (lines.length > 0) {
      lineIdxRef.current = 0;
      xRef.current = lines[0].rect.left;
      positionGuide();
    }
  }, [positionGuide]);

  const handlePlayPause = useCallback(() => {
    setPlaying((p) => !p);
  }, []);

  return (
    <>
      {/* The guide line itself — rendered in the parent document, positioned
          over the iframe's text using parent-coordinate line rects. */}
      <div
        ref={guideElRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '0px',
          top: '0px',
          width: '2px',
          height: '20px',
          background: 'var(--reader-accent, #6b21a8)',
          boxShadow: '0 0 6px 2px rgba(107, 33, 168, 0.5)',
          borderRadius: '2px',
          pointerEvents: 'none',
          zIndex: 65,
          transition: 'none',
          display: ready ? 'block' : 'none',
        }}
      />

      {/* Control bar at the top */}
      <div
        className="fixed top-0 left-0 right-0 z-[66] border-b bg-background/95 backdrop-blur px-4 py-2 flex items-center gap-2"
        role="toolbar"
        aria-label="Reading Guide controls"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground mr-2">
          <Gauge className="w-4 h-4" />
          <span className="font-medium">Reading Guide</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => {
          setPlaying(false);
          const lines = linesRef.current;
          if (lines.length > 0) {
            const prev = Math.max(0, lineIdxRef.current - 1);
            lineIdxRef.current = prev;
            xRef.current = lines[prev].rect.left;
            setLineIdx(prev);
            positionGuide();
          }
        }} aria-label="Previous line">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="default"
          size="icon"
          className="h-8 w-8"
          onClick={handlePlayPause}
          aria-label={playing ? 'Pause' : 'Play'}
          disabled={!ready}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => {
          setPlaying(false);
          const lines = linesRef.current;
          if (lines.length > 0) {
            const next = Math.min(lines.length - 1, lineIdxRef.current + 1);
            lineIdxRef.current = next;
            xRef.current = lines[next].rect.left;
            setLineIdx(next);
            positionGuide();
          }
        }} aria-label="Next line">
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleRestart} aria-label="Restart">
          <RotateCcw className="w-4 h-4" />
        </Button>

        {/* WPM control */}
        <div className="flex items-center gap-2 ml-4 min-w-[180px]">
          <span className="text-xs text-muted-foreground shrink-0">WPM</span>
          <Slider
            min={100}
            max={700}
            step={25}
            value={[settings.speedReadingWpm]}
            onValueChange={(v) => setSetting('speedReadingWpm', v[0])}
            className="flex-1"
            aria-label="Words per minute"
          />
          <span className="text-xs font-medium tabular-nums w-10 text-right">{settings.speedReadingWpm}</span>
        </div>

        {/* Progress through current page */}
        <div className="flex-1 max-w-[200px] ml-4">
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        <div className="text-xs text-muted-foreground tabular-nums">
          Line {lineIdx + 1} / {totalLines || 0}
        </div>

        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Exit reading guide" className="ml-2">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </>
  );
}
