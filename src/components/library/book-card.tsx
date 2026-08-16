'use client';

import { useState } from 'react';
import type { BookMeta } from '@/lib/types';
import { useLibraryStore } from '@/stores/library-store';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { BookOpen, MoreVertical, Trash2, Tag } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export function BookCard({ book }: { book: BookMeta }) {
  const openBook = useLibraryStore((s) => s.openBook);
  const removeBook = useLibraryStore((s) => s.removeBook);
  const updateBook = useLibraryStore((s) => s.updateBook);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [newTag, setNewTag] = useState('');

  const onClick = () => {
    openBook(book.id);
  };
  const onDelete = async () => {
    await removeBook(book.id);
    toast.success('Book removed from library');
  };
  const onAddTag = async () => {
    const t = newTag.trim();
    if (!t) return;
    const tags = Array.from(new Set([...book.tags, t]));
    await updateBook(book.id, { tags });
    setNewTag('');
    setTagDialogOpen(false);
    toast.success(`Tagged "${t}"`);
  };
  const onRemoveTag = async (t: string) => {
    const tags = book.tags.filter((x) => x !== t);
    await updateBook(book.id, { tags });
  };

  const cover = (
    <div
      role="listitem"
      className="group relative aspect-[2/3] rounded-md overflow-hidden border bg-muted/40 cursor-pointer hover:shadow-md transition-shadow focus-within:ring-2 focus-within:ring-ring"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`Open ${book.title} by ${book.author}`}
    >
      {book.cover ? (
        <img
          src={book.cover}
          alt={`Cover of ${book.title}`}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center">
          <BookOpen className="w-8 h-8 text-muted-foreground mb-2" />
          <div className="text-xs font-medium line-clamp-4">{book.title}</div>
        </div>
      )}
      <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold bg-black/60 text-white">
        {book.format}
      </div>
      {book.progress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/40 p-1">
          <Progress value={book.progress * 100} className="h-1" />
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="flex flex-col">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="relative">
              {cover}
              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-7 w-7 bg-black/60 hover:bg-black/80 text-white border-0"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Book options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onClick={onClick}>
                      <BookOpen className="w-4 h-4 mr-2" /> Open
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTagDialogOpen(true)}>
                      <Tag className="w-4 h-4 mr-2" /> Add tag
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={onClick}>
              <BookOpen className="w-4 h-4 mr-2" /> Open
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setTagDialogOpen(true)}>
              <Tag className="w-4 h-4 mr-2" /> Add tag
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem className="text-destructive" onClick={onDelete}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        <div className="mt-2 text-sm">
          <div className="font-medium line-clamp-2 leading-tight">{book.title}</div>
          <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{book.author}</div>
          {book.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {book.tags.slice(0, 3).map((t) => (
                <button
                  key={t}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveTag(t);
                  }}
                  className="inline-flex items-center px-1.5 py-0 rounded text-[10px] bg-muted text-muted-foreground hover:bg-destructive/20"
                  title="Click to remove tag"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Add tag</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Tag name (e.g. fiction, non-fiction, reference)"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onAddTag();
            }}
            aria-label="New tag"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onAddTag}>
              <Tag className="w-4 h-4 mr-2" /> Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
