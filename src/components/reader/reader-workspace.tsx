'use client';

import { useEffect, useState } from 'react';
import { useLibraryStore } from '@/stores/library-store';
import { useReaderStore } from '@/stores/reader-store';
import { ReaderPane } from './reader-pane';
import { ReaderTopBar } from './reader-top-bar';
import { BottomProgressBar } from './bottom-progress-bar';
import { ResizableTocPanel } from './resizable-toc-panel';
import { SpeedReadingOverlay } from './speed-reading-overlay';
import { ReadingGuideOverlay } from './reading-guide-overlay';
import { useReaderProgressStore } from '@/stores/reader-progress-store';
import { Button } from '@/components/ui/button';
import { Gauge, BookOpen } from 'lucide-react';

export function ReaderWorkspace() {
  const primaryId = useLibraryStore((s) => s.primaryBookId);
  const secondaryId = useLibraryStore((s) => s.secondaryBookId);
  const loadSettings = useReaderStore((s) => s.loadSettings);
  const settings = useReaderStore((s) => s.settings);
  const resetProgress = useReaderProgressStore((s) => s.reset);
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Reset progress whenever the book changes so the bottom bar doesn't show
  // stale data from the previous book.
  useEffect(() => {
    resetProgress();
  }, [primaryId, secondaryId, resetProgress]);

  // The overlay is only shown when a speed-reading mode is active.
  // If the user switches to "off" while the overlay is open, we close it
  // by deriving the visible state from the mode.
  const speedReadingEnabled = settings.speedReadingMode === 'rsvp' || settings.speedReadingMode === 'guide';
  const overlayVisible = overlayOpen && speedReadingEnabled;

  // Split-screen has been removed. Only the primary (or, as a fallback,
  // secondary) book is shown full-width.
  const bookId = primaryId ?? secondaryId;

  return (
    <div className="flex flex-col h-screen">
      <ReaderTopBar />
      <div className="flex-1 overflow-hidden flex">
        <ResizableTocPanel />
        <div className="flex-1 overflow-hidden pb-7 relative">
          {bookId && <ReaderPane slot="primary" bookId={bookId} />}
          {/* Speed Reading launch button — only shown when a mode is enabled and overlay is closed */}
          {speedReadingEnabled && !overlayVisible && (
            <Button
              variant="secondary"
              size="sm"
              className="fixed bottom-12 right-4 shadow-md z-30"
              onClick={() => setOverlayOpen(true)}
              aria-label={
                settings.speedReadingMode === 'rsvp' ? 'Start RSVP speed reading' : 'Start reading guide'
              }
            >
              {settings.speedReadingMode === 'rsvp' ? (
                <Gauge className="w-4 h-4 mr-2" />
              ) : (
                <BookOpen className="w-4 h-4 mr-2" />
              )}
              {settings.speedReadingMode === 'rsvp' ? 'Speed Read' : 'Reading Guide'}
            </Button>
          )}
        </div>
      </div>
      <BottomProgressBar />
      {overlayVisible && settings.speedReadingMode === 'rsvp' && (
        <SpeedReadingOverlay onClose={() => setOverlayOpen(false)} />
      )}
      {overlayVisible && settings.speedReadingMode === 'guide' && (
        <ReadingGuideOverlay onClose={() => setOverlayOpen(false)} />
      )}
    </div>
  );
}
