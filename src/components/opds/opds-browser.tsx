'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, Download, BookOpen } from 'lucide-react';
import type { OpdsCatalog, OpdsEntry } from '@/lib/types';
import { useLibraryStore } from '@/stores/library-store';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PRESETS = [
  { label: 'Standard Ebooks', url: 'https://standardebooks.org/opds/all' },
  { label: 'Project Gutenberg', url: 'https://m.gutenberg.org/ebooks.opds/' },
  { label: 'Feedbooks Public Domain', url: 'https://www.feedbooks.com/publicdomain/catalog.atom' },
  { label: 'Calibre Server (localhost:8080)', url: 'http://localhost:8080/opds' },
];

export function OpdsBrowser() {
  const [url, setUrl] = useState(PRESETS[0].url);
  const [history, setHistory] = useState<string[]>([]);
  const [feed, setFeed] = useState<OpdsCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const addFromUrl = useLibraryStore((s) => s.addFromUrl);
  const openBook = useLibraryStore((s) => s.openBook);

  const fetchFeed = async (target: string, pushHistory = true) => {
    setLoading(true);
    try {
      const res = await fetch('/api/opds?url=' + encodeURIComponent(target));
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'HTTP ' + res.status }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as OpdsCatalog;
      setFeed(data);
      if (pushHistory) setHistory((h) => [...h, target]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      toast.error('OPDS fetch failed: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed(url, false);
     
  }, []);

  const onBack = () => {
    if (history.length <= 1) return;
    const newHist = history.slice(0, -1);
    const target = newHist[newHist.length - 1];
    setHistory(newHist);
    setUrl(target);
    fetchFeed(target, false);
  };

  const onDownload = async (entry: OpdsEntry) => {
    if (!entry.downloadUrl) {
      toast.error('No download link for this entry.');
      return;
    }
    setDownloadingId(entry.id);
    try {
      const fileName = guessFileName(entry);
      const book = await addFromUrl(entry.downloadUrl, fileName, 'opds');
      if (book) {
        toast.success(`Added "${book.title}"`);
        openBook(book.id);
      } else {
        toast.error('Download failed: could not parse file.');
      }
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b">
        <Button
          variant="outline"
          size="icon"
          onClick={onBack}
          disabled={history.length <= 1}
          aria-label="Back"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') fetchFeed(url);
          }}
          placeholder="OPDS feed URL"
          aria-label="OPDS feed URL"
        />
        <Button onClick={() => fetchFeed(url)} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Go'}
        </Button>
        <Select
          value=""
          onValueChange={(v) => {
            if (v) {
              setUrl(v);
              fetchFeed(v);
            }
          }}
        >
          <SelectTrigger className="w-[180px]" aria-label="Choose a preset OPDS catalog">
            <SelectValue placeholder="Presets" />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.url} value={p.url}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto thin-scroll p-4 space-y-4">
        {feed?.navLinks && feed.navLinks.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {feed.navLinks.map((l, i) => (
              <Button
                key={i}
                variant="secondary"
                size="sm"
                onClick={() => {
                  setUrl(l.href);
                  fetchFeed(l.href);
                }}
              >
                {l.title}
              </Button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {feed?.entries.map((e) => (
            <div key={e.id} className="flex gap-3 p-3 border rounded-lg">
              <div className="w-16 h-24 shrink-0 bg-muted rounded overflow-hidden">
                {e.cover ? (
                   
                  <img src={e.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center">
                    <BookOpen className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm line-clamp-2">{e.title}</div>
                <div className="text-xs text-muted-foreground line-clamp-1">{e.author}</div>
                {e.summary && (
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{e.summary}</div>
                )}
                <Button
                  size="sm"
                  className="mt-2 h-7"
                  onClick={() => onDownload(e)}
                  disabled={!e.downloadUrl || downloadingId === e.id}
                >
                  {downloadingId === e.id ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 mr-1" />
                  )}
                  Download
                </Button>
              </div>
            </div>
          ))}
          {feed && feed.entries.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-12">
              No books in this catalog view.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function guessFileName(entry: OpdsEntry): string {
  const safe = entry.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
  const ext = entry.format ?? 'epub';
  return `${safe || 'book'}.${ext}`;
}
