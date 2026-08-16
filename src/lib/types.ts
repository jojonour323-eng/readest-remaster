// Core domain types for the reader app

export type BookFormat = 'epub' | 'mobi' | 'azw3' | 'fb2' | 'cbz' | 'txt' | 'pdf';

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  cover?: string; // data URL
  size: number;
  addedAt: number;
  lastReadAt?: number;
  progress: number; // 0..1
  location?: string; // serialized CFI / page pointer
  tags: string[];
  source?: 'local' | 'opds' | 'calibre';
  sourceUrl?: string;
}

export interface Highlight {
  id: string;
  bookId: string;
  cfiRange: string;       // for EPUB
  text: string;
  color: HighlightColor;
  note?: string;
  createdAt: number;
  // The chapter name containing this highlight (determined from the actual
  // location of the highlighted text, not the chapter being viewed).
  chapter?: string;
  // context for AI features
  beforeText?: string;
  afterText?: string;
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

export interface Bookmark {
  id: string;
  bookId: string;
  cfiRange: string;
  label: string;
  createdAt: number;
  progress: number;
}

export interface Simplification {
  id: string;
  bookId: string;
  original: string;
  simplified: string;
  beforeContext?: string;
  afterContext?: string;
  cfiRange?: string;
  createdAt: number;
}

export interface ReaderSettings {
  theme: ThemeName;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  margin: number;
  pageMode: 'scroll' | 'paginated';
  spreadView: boolean; // two-page (spread) view, like an open book
  fontFamilyCustom?: string;
  justifyText: boolean;
  hyphenate: boolean;
  // Speed reading settings
  speedReadingMode: 'off' | 'rsvp' | 'guide'; // which speed-reading mode is active
  speedReadingWpm: number;     // words per minute (used by both RSVP and Guide)
  guideCentered: boolean;      // Reading Guide: keep active line centered
}

export type ThemeName = 'light' | 'dark' | 'sepia' | 'ambient';

export interface LibraryFilters {
  search: string;
  sortBy: 'recent' | 'title' | 'author' | 'progress';
  filterTag?: string;
  format?: BookFormat;
}

export interface OpdsEntry {
  id: string;
  title: string;
  author?: string;
  summary?: string;
  cover?: string;
  downloadUrl: string;
  format?: BookFormat;
  acquisition?: string;
}

export interface OpdsCatalog {
  title: string;
  entries: OpdsEntry[];
  navLinks: { title: string; href: string }[];
}
