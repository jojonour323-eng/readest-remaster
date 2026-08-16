'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search } from 'lucide-react';
import { useLibraryStore } from '@/stores/library-store';

interface Result {
  cfi: string;
  excerpt: string;
}

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const primaryId = useLibraryStore((s) => s.primaryBookId);

  const run = async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const fn = (window as unknown as { __readerSearch?: (q: string) => Promise<Result[]> }).__readerSearch;
      if (!fn) {
        setResults([]);
        return;
      }
      const r = await fn(q);
      setResults(r.slice(0, 100));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    timer.current = setTimeout(() => run(query), 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
     
  }, [query, primaryId]);

  return (
    <div className="p-3 space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search inside this book…"
          aria-label="Search query"
          className="pl-9"
        />
        {loading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
      </div>
      <div className="text-xs text-muted-foreground">
        {searched && !loading && `${results.length} ${results.length === 1 ? 'result' : 'results'}`}
      </div>
      <div className="space-y-1.5 max-h-[calc(100vh-180px)] overflow-y-auto thin-scroll">
        {results.map((r, i) => (
          <button
            key={i}
            className="w-full text-left p-2 rounded hover:bg-accent transition-colors border border-transparent hover:border-border"
            onClick={() => {
              const go = (window as unknown as { __readerGoToCfi?: (cfi: string) => void }).__readerGoToCfi;
              if (go) go(r.cfi);
            }}
          >
            <div className="text-sm">…{r.excerpt}…</div>
          </button>
        ))}
        {searched && !loading && results.length === 0 && (
          <div className="text-center text-muted-foreground py-6 text-sm">No matches.</div>
        )}
      </div>
    </div>
  );
}
