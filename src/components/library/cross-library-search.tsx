'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { searchAcrossLibrary } from '@/lib/storage';
import { useLibraryStore } from '@/stores/library-store';
import { Search, Loader2 } from 'lucide-react';
import type { BookMeta } from '@/lib/types';

type Result = {
  bookId: string;
  title: string;
  author: string;
  snippet: string;
};

export function CrossLibrarySearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const openBook = useLibraryStore((s) => s.openBook);
  const books = useLibraryStore((s) => s.books);

  const onSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await searchAcrossLibrary(query);
      setResults(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const open = (bookId: string) => {
    openBook(bookId);
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
        className="flex gap-2"
      >
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search inside every book in your library…"
          aria-label="Search query"
        />
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Search
        </Button>
      </form>
      <div className="max-h-80 overflow-y-auto thin-scroll text-sm space-y-2">
        {loading && <div className="text-muted-foreground text-center py-6">Searching…</div>}
        {!loading && searched && results.length === 0 && (
          <div className="text-muted-foreground text-center py-6">
            No matches across your library.
          </div>
        )}
        {!loading && results.map((r, i) => {
          const book = books.find((b) => b.id === r.bookId) as BookMeta | undefined;
          return (
            <button
              key={`${r.bookId}-${i}`}
              onClick={() => open(r.bookId)}
              className="w-full text-left p-3 rounded-md hover:bg-accent transition-colors border"
            >
              <div className="text-xs text-muted-foreground mb-0.5">
                {book?.title ?? r.title} · {book?.author ?? r.author}
              </div>
              <div className="text-sm">{r.snippet}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
