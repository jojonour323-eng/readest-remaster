'use client';

import { useEffect, useState } from 'react';
import { useLibraryStore } from '@/stores/library-store';
import * as storage from '@/lib/storage';
import type { Bookmark, Highlight } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { BookmarkPlus, Trash2, StickyNote, Sparkles, Highlighter } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export function BookmarksPanel() {
  const primaryId = useLibraryStore((s) => s.primaryBookId);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [simplifications, setSimplifications] = useState<import('@/lib/types').Simplification[]>([]);

  const load = async () => {
    if (!primaryId) return;
    const [b, h, s] = await Promise.all([
      storage.listBookmarks(primaryId),
      storage.listHighlights(primaryId),
      storage.listSimplifications(primaryId),
    ]);
    setBookmarks(b);
    setHighlights(h);
    setSimplifications(s);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!primaryId) return;
      const [b, h, s] = await Promise.all([
        storage.listBookmarks(primaryId),
        storage.listHighlights(primaryId),
        storage.listSimplifications(primaryId),
      ]);
      if (cancelled) return;
      setBookmarks(b);
      setHighlights(h);
      setSimplifications(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [primaryId]);

  const onAddBookmark = async () => {
    const fn = (window as unknown as { __readerBookmarkCurrent?: () => Promise<void> }).__readerBookmarkCurrent;
    if (fn) {
      await fn();
      await load();
    }
  };

  const onDeleteBookmark = async (id: string) => {
    await storage.deleteBookmark(id);
    setBookmarks((bs) => bs.filter((b) => b.id !== id));
  };

  const onDeleteHighlight = async (id: string) => {
    await storage.deleteHighlight(id);
    setHighlights((hs) => hs.filter((h) => h.id !== id));
  };

  const onGoCfi = (cfi: string) => {
    const go = (window as unknown as { __readerGoToCfi?: (cfi: string) => void }).__readerGoToCfi;
    if (go) go(cfi);
  };

  return (
    <div className="p-3">
      <Tabs defaultValue="bookmarks">
        <TabsList className="grid grid-cols-3 mb-3">
          <TabsTrigger value="bookmarks">
            <BookmarkPlus className="w-3.5 h-3.5 mr-1" />
            Marks
          </TabsTrigger>
          <TabsTrigger value="highlights">
            <Highlighter className="w-3.5 h-3.5 mr-1" />
            Highlights
          </TabsTrigger>
          <TabsTrigger value="simplifications">
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            Simple
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bookmarks" className="space-y-2 mt-0">
          <Button size="sm" className="w-full mb-2" onClick={onAddBookmark}>
            <BookmarkPlus className="w-4 h-4 mr-2" />
            Bookmark current page
          </Button>
          <div className="space-y-1.5 max-h-[calc(100vh-220px)] overflow-y-auto thin-scroll">
            {bookmarks.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-6">No bookmarks yet.</div>
            )}
            {bookmarks.map((b) => (
              <div key={b.id} className="flex items-start gap-2 p-2 border rounded hover:bg-accent/40">
                <button onClick={() => onGoCfi(b.cfiRange)} className="flex-1 text-left min-w-0">
                  <div className="text-sm truncate">{b.label}</div>
                  <div className="text-xs text-muted-foreground">{Math.round(b.progress * 100)}%</div>
                </button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDeleteBookmark(b.id)} aria-label="Delete bookmark">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="highlights" className="space-y-2 mt-0">
          <div className="space-y-1.5 max-h-[calc(100vh-220px)] overflow-y-auto thin-scroll">
            {highlights.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-6">No highlights yet. Select text in the reader to highlight.</div>
            )}
            {highlights.map((h) => (
              <div key={h.id} className="p-2 border rounded hover:bg-accent/40">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-3 h-3 rounded hl-${h.color}`} />
                  <span className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString()}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => onDeleteHighlight(h.id)} aria-label="Delete highlight">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <button onClick={() => onGoCfi(h.cfiRange)} className="block w-full text-left">
                  {h.chapter && (
                    <div className="text-[11px] font-medium text-muted-foreground mb-1 truncate" title={h.chapter}>
                      {h.chapter}
                    </div>
                  )}
                  <div className="text-sm italic line-clamp-3">"{h.text}"</div>
                  {h.note && (
                    <div className="mt-1.5 text-xs flex items-start gap-1.5 text-muted-foreground">
                      <StickyNote className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{h.note}</span>
                    </div>
                  )}
                </button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="simplifications" className="space-y-2 mt-0">
          <div className="space-y-1.5 max-h-[calc(100vh-220px)] overflow-y-auto thin-scroll">
            {simplifications.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-6">
                No simplifications yet. Select a sentence in the reader, then tap <Sparkles className="inline w-3 h-3" /> Simplify.
              </div>
            )}
            {simplifications.map((s) => (
              <div key={s.id} className="p-2 border rounded">
                <div className="text-xs text-muted-foreground mb-1">{new Date(s.createdAt).toLocaleString()}</div>
                <div className="text-sm italic opacity-70 mb-1">Original: {s.original}</div>
                <div className="text-sm flex items-start gap-1.5">
                  <Sparkles className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
                  <span>{s.simplified}</span>
                </div>
                {s.cfiRange && (
                  <Button variant="link" size="sm" className="h-6 px-0 mt-1" onClick={() => onGoCfi(s.cfiRange)}>
                    Go to location
                  </Button>
                )}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
