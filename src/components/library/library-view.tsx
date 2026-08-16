'use client';

import { useMemo, useRef } from 'react';
import { useLibraryStore } from '@/stores/library-store';
import { LibraryToolbar } from './library-toolbar';
import { LibraryGrid } from './library-grid';
import { UploadButton } from './upload-button';
import { OpdsBrowser } from '@/components/opds/opds-browser';
import { CrossLibrarySearch } from './cross-library-search';
import { SyncMenu } from './sync-menu';
import { Button } from '@/components/ui/button';
import { BookOpen, Library as LibIcon, Globe, Search, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export function LibraryView() {
  const books = useLibraryStore((s) => s.books);
  const loading = useLibraryStore((s) => s.loading);
  const filtered = useLibraryStore((s) => s.filtered);
  const [opdsOpen, setOpdsOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  const list = useMemo(() => filtered(), [filtered, books]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Readest Web</h1>
              <p className="text-xs text-muted-foreground leading-tight">
                {books.length} {books.length === 1 ? 'book' : 'books'} in library
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGlobalSearchOpen(true)}
              aria-label="Search across library"
            >
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpdsOpen(true)}
              aria-label="Browse OPDS catalog"
            >
              <Globe className="w-4 h-4 mr-2" />
              OPDS
            </Button>
            <SyncMenu />
            <UploadButton />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-4 flex-1">
        <LibraryToolbar />
        {loading ? (
          <div className="py-20 text-center text-muted-foreground" aria-busy="true">
            <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-3" />
            Loading library…
          </div>
        ) : list.length === 0 ? (
          <div className="py-20 text-center">
            <LibIcon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-medium mb-2">Your library is empty</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Upload an EPUB, MOBI, AZW3, FB2, CBZ, or TXT file to start reading. Everything stays in your browser — nothing is uploaded to a server.
            </p>
            <UploadButton />
          </div>
        ) : (
          <LibraryGrid books={list} />
        )}
      </div>

      <footer className="border-t py-4 mt-auto">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
          Readest Web · runs fully in your browser · {books.length} {books.length === 1 ? 'book' : 'books'} stored locally
        </div>
      </footer>

      <Dialog open={opdsOpen} onOpenChange={setOpdsOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-4xl h-[80vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-2 border-b">
            <DialogTitle>Browse OPDS / Calibre Catalog</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden h-[calc(80vh-64px)]">
            <OpdsBrowser />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={globalSearchOpen} onOpenChange={setGlobalSearchOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Search across library</DialogTitle>
          </DialogHeader>
          <CrossLibrarySearch />
        </DialogContent>
      </Dialog>
    </div>
  );
}
