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
import { useReaderProgressStore } from '@/stores/reader-progress-store';
import type { ReaderHandle } from './reader-pane';

interface Props {
  onClose: () => void;
}

/**
 * RSVP (Rapid Serial Visual Presentation) speed-reading overlay.
 *
 * Displays the book's actual text one short segment at a time at a
 * controlled WPM. Uses the reader handle's getChapterText() to pull
 * real book text — no rewriting, simplification, or translation.
 *
 * The overlay:
 *  - Remembers the reader's current CFI on entry, restores it on exit.
 *  - Updates the reader location as the user progresses (so the main
 *    reader and progress bar stay in sync).
 *  - Continues naturally across chapter boundaries.
 *  - Captures keyboard: Space=play/pause, ←/→=prev/next segment.
 */
export function SpeedReadingOverlay({ onClose }: Props) {
  const settings = useReaderStore((s) => s.settings);
  const setSetting = useReaderStore((s) => s.setSetting);
  const chapterLabel = useReaderProgressStore((s) => s.chapterLabel);

  const [words, setWords] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);

  const handleRef = useRef<ReaderHandle | null>(null);
  const savedCfiRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordsRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const wpmRef = useRef(settings.speedReadingWpm);

  // Keep refs in sync for use inside interval callbacks
  useEffect(() => { wordsRef.current = words; }, [words]);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { wpmRef.current = settings.speedReadingWpm; }, [settings.speedReadingWpm]);

  // Get the reader handle from the window registry
  useEffect(() => {
    handleRef.current = (window as unknown as { __readerHandle?: ReaderHandle | null }).__readerHandle ?? null;
  }, []);

  // Set the speed-reading active flag so the normal keyboard handler
  // doesn't process arrow keys while the overlay is open.
  useEffect(() => {
    (window as unknown as { __speedReadingActive?: boolean }).__speedReadingActive = true;
    return () => {
      (window as unknown as { __speedReadingActive?: boolean }).__speedReadingActive = false;
    };
  }, []);

  // Load the current chapter's text on mount
  const loadCurrentChapter = useCallback(async () => {
    const h = handleRef.current;
    if (!h) return;
    setLoading(true);
    try {
      const cfi = h.getCurrentCfi?.() || savedCfiRef.current || '';
      if (cfi) {
        const text = await h.getChapterText?.(cfi) || '';
        // Split into words but keep punctuation attached
        const w = text.split(/\s+/).filter(Boolean);
        setWords(w);
        setIndex(0);
        indexRef.current = 0;
      }
    } catch (e) {
      console.error('speed reading load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = handleRef.current;
    if (h) {
      savedCfiRef.current = h.getCurrentCfi?.() || null;
    }
    loadCurrentChapter();
  }, []);

  // Play/pause timer
  useEffect(() => {
    if (!playing) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    const tick = () => {
      if (indexRef.current >= wordsRef.current.length - 1) {
        // Reached end of current chapter — try to load the next chapter.
        loadNextChapter();
        return;
      }
      setIndex((i) => i + 1);
      const wpm = wpmRef.current || 300;
      // Slightly longer pause for longer words (improves readability)
      const word = wordsRef.current[indexRef.current + 1] || '';
      const baseMs = 60000 / wpm;
      const lengthAdj = word.length > 8 ? baseMs * 0.5 : 0;
      timerRef.current = setTimeout(tick, baseMs + lengthAdj);
    };
    timerRef.current = setTimeout(tick, 60000 / (wpmRef.current || 300));
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [playing, loadCurrentChapter]);

  const loadNextChapter = useCallback(async () => {
    const h = handleRef.current;
    if (!h) return;
    // Advance the reader to the next chapter and load its text.
    h.next();
    // Wait a moment for the reader to relocate, then load the new chapter.
    setTimeout(async () => {
      const cfi = h.getCurrentCfi?.() || '';
      if (cfi) {
        const text = await h.getChapterText?.(cfi) || '';
        const w = text.split(/\s+/).filter(Boolean);
        setWords(w);
        setIndex(0);
        indexRef.current = 0;
        setCurrentChapterIdx((i) => i + 1);
      }
    }, 300);
  }, []);

  // Keyboard controls (captured by the overlay, not the normal reader)
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
        setPlaying(false);
        setIndex((i) => Math.min(wordsRef.current.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        setPlaying(false);
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true); // capture phase
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const handleClose = useCallback(() => {
    // Restore the reader to the saved CFI on exit
    const h = handleRef.current;
    if (h && savedCfiRef.current) {
      h.displayCfi?.(savedCfiRef.current);
    }
    onClose();
  }, [onClose]);

  const handleRestart = useCallback(() => {
    setPlaying(false);
    setIndex(0);
    indexRef.current = 0;
  }, []);

  const progress = words.length > 0 ? (index / words.length) * 100 : 0;
  const currentWord = words[index] || '';

  return (
    <div
      className="fixed inset-0 z-[70] bg-background/95 backdrop-blur flex flex-col"
      role="dialog"
      aria-label="Speed reading mode"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Gauge className="w-4 h-4" />
          <span className="font-medium">Speed Reading</span>
          {chapterLabel && (
            <span className="text-xs text-muted-foreground/70">· {chapterLabel}</span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Exit speed reading">
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Central reading area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {loading ? (
          <div className="text-muted-foreground">Loading chapter text…</div>
        ) : (
          <div
            className="text-center select-none"
            style={{ fontSize: '40px', fontWeight: 400, lineHeight: 1.4, maxWidth: '80vw' }}
            key={`${currentChapterIdx}-${index}`}
          >
            <span className="text-foreground">{currentWord}</span>
          </div>
        )}

        {/* Progress through current chapter */}
        <div className="w-full max-w-md mt-12">
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground tabular-nums">
            <span>{index} / {words.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="border-t px-4 py-3 flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => { setPlaying(false); setIndex((i) => Math.max(0, i - 1)); }} aria-label="Previous word">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <Button
          variant="default"
          size="icon"
          className="h-10 w-10"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => { setPlaying(false); setIndex((i) => Math.min(words.length - 1, i + 1)); }} aria-label="Next word">
          <ChevronRight className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleRestart} aria-label="Restart">
          <RotateCcw className="w-5 h-5" />
        </Button>

        {/* WPM control */}
        <div className="flex items-center gap-2 ml-4 min-w-[200px]">
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
      </div>
    </div>
  );
}
