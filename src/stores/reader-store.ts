'use client';

import { create } from 'zustand';
import type { ReaderSettings, ThemeName } from '@/lib/types';
import * as storage from '@/lib/storage';

interface ReaderUiState {
  settings: ReaderSettings;
  ready: boolean;
  loadSettings: () => Promise<void>;
  setSetting: <K extends keyof ReaderSettings>(k: K, v: ReaderSettings[K]) => Promise<void>;
  setTheme: (t: ThemeName) => Promise<void>;
  togglePageMode: () => Promise<void>;
  // panels
  tocOpen: boolean;
  searchOpen: boolean;
  bookmarkOpen: boolean;
  settingsOpen: boolean;
  setPanel: (panel: 'toc' | 'search' | 'bookmark' | 'settings', open: boolean) => void;
  closeAllPanels: () => void;
}

export const useReaderStore = create<ReaderUiState>((set, get) => ({
  settings: storage.defaultSettings,
  ready: false,
  loadSettings: async () => {
    const s = await storage.loadSettings();
    set({ settings: s, ready: true });
    applyThemeClass(s.theme);
  },
  setSetting: async (k, v) => {
    const next = { ...get().settings, [k]: v };
    set({ settings: next });
    await storage.saveSettings(next);
    if (k === 'theme') applyThemeClass(next.theme);
  },
  setTheme: async (t) => {
    const next = { ...get().settings, theme: t };
    set({ settings: next });
    await storage.saveSettings(next);
    applyThemeClass(t);
  },
  togglePageMode: async () => {
    const cur = get().settings.pageMode;
    const next = { ...get().settings, pageMode: cur === 'scroll' ? 'paginated' : 'scroll' };
    set({ settings: next });
    await storage.saveSettings(next);
  },
  tocOpen: false,
  searchOpen: false,
  bookmarkOpen: false,
  settingsOpen: false,
  setPanel: (panel, open) => {
    set({
      tocOpen: panel === 'toc' ? open : false,
      searchOpen: panel === 'search' ? open : false,
      bookmarkOpen: panel === 'bookmark' ? open : false,
      settingsOpen: panel === 'settings' ? open : false,
    });
  },
  closeAllPanels: () => {
    set({ tocOpen: false, searchOpen: false, bookmarkOpen: false, settingsOpen: false });
  },
}));

export function applyThemeClass(theme: ThemeName) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark', 'theme-sepia', 'theme-ambient');
  root.classList.add(`theme-${theme}`);
  if (theme === 'dark' || theme === 'ambient') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}
