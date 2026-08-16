'use client';

import { useEffect } from 'react';
import { useLibraryStore } from '@/stores/library-store';
import { LibraryView } from '@/components/library/library-view';
import { ReaderWorkspace } from '@/components/reader/reader-workspace';

export default function Home() {
  const load = useLibraryStore((s) => s.load);
  const primaryBookId = useLibraryStore((s) => s.primaryBookId);

  useEffect(() => {
    load();
  }, [load]);

  const reading = !!primaryBookId;

  return (
    <main className="min-h-screen bg-background text-foreground" aria-label="Readest Web">
      {reading ? <ReaderWorkspace /> : <LibraryView />}
    </main>
  );
}
