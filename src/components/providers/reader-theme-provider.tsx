'use client';

import { useEffect } from 'react';
import { useReaderStore, applyThemeClass } from '@/stores/reader-store';

export function ReaderThemeProvider({ children }: { children: React.ReactNode }) {
  const loadSettings = useReaderStore((s) => s.loadSettings);
  const settings = useReaderStore((s) => s.settings);
  const ready = useReaderStore((s) => s.ready);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (ready) applyThemeClass(settings.theme);
  }, [ready, settings.theme]);

  return <>{children}</>;
}
