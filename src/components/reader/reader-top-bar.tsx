'use client';

import { useLibraryStore } from '@/stores/library-store';
import { useReaderStore } from '@/stores/reader-store';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  List,
  Search,
  Bookmark as BookmarkIcon,
  Settings as SettingsIcon,
  Library,
  SunMoon,
  ChevronLeft,
  ChevronRight,
  ScrollText,
  BookOpen,
} from 'lucide-react';
import { SearchPanel } from './search-panel';
import { BookmarksPanel } from './bookmarks-panel';
import { SettingsPanel } from './settings-panel';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ThemeName } from '@/lib/types';

export function ReaderTopBar() {
  const primary = useLibraryStore((s) => s.primaryBookId);
  const books = useLibraryStore((s) => s.books);
  const closeReader = useLibraryStore((s) => s.closeReader);
  const backToLibrary = () => {
    closeReader();
  };

  const setPanel = useReaderStore((s) => s.setPanel);
  const tocOpen = useReaderStore((s) => s.tocOpen);
  const searchOpen = useReaderStore((s) => s.searchOpen);
  const bookmarkOpen = useReaderStore((s) => s.bookmarkOpen);
  const settingsOpen = useReaderStore((s) => s.settingsOpen);

  const settings = useReaderStore((s) => s.settings);
  const setTheme = useReaderStore((s) => s.setTheme);
  const togglePageMode = useReaderStore((s) => s.togglePageMode);

  const [activePanel, setActivePanel] = useState<'search' | 'bookmark' | 'settings' | null>(null);

  // TOC is now a dedicated resizable panel (ResizableTocPanel), driven
  // directly by `tocOpen`. Only Search/Bookmarks/Settings are Sheets here.
  const activePanelDerived: typeof activePanel = searchOpen
    ? 'search'
    : bookmarkOpen
      ? 'bookmark'
      : settingsOpen
        ? 'settings'
        : null;

  // Use derived value for rendering, but keep state for transitions.
  void activePanel;
  void setActivePanel;

  const primaryBook = books.find((b) => b.id === primary);
  const title = primaryBook?.title ?? 'Reader';

  const togglePanel = (p: 'toc' | 'search' | 'bookmark' | 'settings') => {
    if (p === 'toc') setPanel('toc', !tocOpen);
    if (p === 'search') setPanel('search', !searchOpen);
    if (p === 'bookmark') setPanel('bookmark', !bookmarkOpen);
    if (p === 'settings') setPanel('settings', !settingsOpen);
  };

  return (
    <header
      className="border-b bg-background/95 backdrop-blur sticky top-0 z-30"
      role="banner"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Button variant="ghost" size="sm" onClick={backToLibrary} aria-label="Back to library">
          <Library className="w-4 h-4 mr-2" />
          Library
        </Button>
        <div className="flex-1 text-center min-w-0">
          <div className="truncate text-sm font-medium" title={title}>{title}</div>
        </div>

        <Button variant="ghost" size="icon" aria-label="Table of contents" onClick={() => togglePanel('toc')}>
          <List className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Search in book" onClick={() => togglePanel('search')}>
          <Search className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Bookmarks" onClick={() => togglePanel('bookmark')}>
          <BookmarkIcon className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Reader settings" onClick={() => togglePanel('settings')}>
          <SettingsIcon className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Switch to ${settings.pageMode === 'scroll' ? 'paginated' : 'scroll'} mode`}
          onClick={togglePageMode}
          title={`Page mode: ${settings.pageMode}`}
        >
          {settings.pageMode === 'scroll' ? <ScrollText className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Switch theme">
              <SunMoon className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setTheme('light')}>
              <span className="w-3 h-3 rounded-full bg-white border mr-2" /> Light
              {settings.theme === 'light' && <span className="ml-auto">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('sepia')}>
              <span className="w-3 h-3 rounded-full bg-[#f4ecd8] border mr-2" /> Sepia
              {settings.theme === 'sepia' && <span className="ml-auto">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}>
              <span className="w-3 h-3 rounded-full bg-[#121316] border mr-2" /> Dark
              {settings.theme === 'dark' && <span className="ml-auto">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('ambient')}>
              <span className="w-3 h-3 rounded-full bg-[#1a1d2b] border mr-2" /> Ambient
              {settings.theme === 'ambient' && <span className="ml-auto">✓</span>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Sheet panels for the active reader (primary) */}
      {/* Note: TOC is now a dedicated resizable left-side panel
          (ResizableTocPanel), not a Sheet. Only Search/Bookmarks/Settings
          remain as Sheets. */}
      <Sheet open={activePanelDerived === 'search'} onOpenChange={(o) => setPanel('search', o)}>
        <SheetContent side="left" className="w-[360px] sm:w-[420px] p-0 overflow-y-auto thin-scroll">
          <SheetHeader className="px-4 py-3 border-b sticky top-0 bg-background z-10">
            <SheetTitle>Search in book</SheetTitle>
          </SheetHeader>
          <SearchPanel />
        </SheetContent>
      </Sheet>
      <Sheet open={activePanelDerived === 'bookmark'} onOpenChange={(o) => setPanel('bookmark', o)}>
        <SheetContent side="left" className="w-[320px] sm:w-[380px] p-0 overflow-y-auto thin-scroll">
          <SheetHeader className="px-4 py-3 border-b sticky top-0 bg-background z-10">
            <SheetTitle>Bookmarks & Highlights</SheetTitle>
          </SheetHeader>
          <BookmarksPanel />
        </SheetContent>
      </Sheet>
      <Sheet open={activePanelDerived === 'settings'} onOpenChange={(o) => setPanel('settings', o)}>
        <SheetContent side="right" className="w-[320px] sm:w-[380px] p-0 overflow-y-auto thin-scroll">
          <SheetHeader className="px-4 py-3 border-b sticky top-0 bg-background z-10">
            <SheetTitle>Reader settings</SheetTitle>
          </SheetHeader>
          <SettingsPanel />
        </SheetContent>
      </Sheet>

      {/* Screen-reader-only live region for navigation announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true" id="reader-live-region"></div>
    </header>
  );
}

export const NAV_ARROWS = { ChevronLeft, ChevronRight };

export type ThemeNameAlias = ThemeName;
