'use client';

import { create } from 'zustand';

/**
 * A chapter boundary marker for the whole-book progress bar.
 * `at` is the fractional position (0..1) within the entire book where this
 * chapter begins.
 */
export interface ChapterMarker {
  /** Chapter title (for tooltip) */
  label: string;
  /** Fractional position in the whole book, 0..1 */
  at: number;
}

export interface ReadingProgress {
  // ----- Whole-book progress (primary) -----
  /** Progress through the ENTIRE book, 0..1 */
  bookProgress: number;
  /** Current page within the entire book (1-indexed) */
  bookPage: number;
  /** Total pages in the entire book */
  bookTotalPages: number;
  /** Pages left until the end of the entire book */
  bookPagesLeft: number;
  /** Chapter boundary markers (positions where each chapter starts) */
  chapterMarkers: ChapterMarker[];

  // ----- Current-chapter progress (secondary) -----
  /** Progress through the current chapter, 0..1 */
  chapterProgress: number;
  /** Pages left until the end of the current chapter */
  chapterPagesLeft: number;
  /** Display label for the current chapter (e.g. "Chapter 1 — The Arrival") */
  chapterLabel: string;
}

interface ReaderProgressState extends ReadingProgress {
  set: (p: Partial<ReadingProgress>) => void;
  reset: () => void;
}

const EMPTY: ReadingProgress = {
  bookProgress: 0,
  bookPage: 0,
  bookTotalPages: 0,
  bookPagesLeft: 0,
  chapterMarkers: [],
  chapterProgress: 0,
  chapterPagesLeft: 0,
  chapterLabel: '',
};

function shallowDiffers<T extends Record<string, unknown>>(a: T, b: Partial<T>): boolean {
  for (const k in b) {
    if (a[k] !== b[k]) return true;
  }
  return false;
}

export const useReaderProgressStore = create<ReaderProgressState>((set) => ({
  ...EMPTY,
  // Only update state if at least one value actually changed. This prevents
  // unnecessary re-renders of the BottomProgressBar on every reader event.
  set: (p) =>
    set((s) => {
      if (!shallowDiffers(s, p)) return s;
      return { ...s, ...p };
    }),
  reset: () => set({ ...EMPTY, chapterMarkers: [] }),
}));
