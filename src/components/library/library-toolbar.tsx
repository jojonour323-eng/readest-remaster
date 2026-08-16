'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLibraryStore } from '@/stores/library-store';
import { Search, ArrowUpDown } from 'lucide-react';
import type { BookFormat } from '@/lib/types';

export function LibraryToolbar() {
  const filters = useLibraryStore((s) => s.filters);
  const setFilter = useLibraryStore((s) => s.setFilter);

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Search by title or author…"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
          className="pl-9"
          aria-label="Search library"
        />
      </div>
      <div className="flex items-center gap-2">
        <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
        <Select
          value={filters.sortBy}
          onValueChange={(v) => setFilter('sortBy', v as typeof filters.sortBy)}
        >
          <SelectTrigger className="w-[150px]" aria-label="Sort books by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Recently read</SelectItem>
            <SelectItem value="title">Title</SelectItem>
            <SelectItem value="author">Author</SelectItem>
            <SelectItem value="progress">Reading progress</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Select
        value={filters.format ?? 'all'}
        onValueChange={(v) => setFilter('format', v === 'all' ? undefined : (v as BookFormat))}
      >
        <SelectTrigger className="w-[130px]" aria-label="Filter by format">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All formats</SelectItem>
          <SelectItem value="epub">EPUB</SelectItem>
          <SelectItem value="mobi">MOBI</SelectItem>
          <SelectItem value="azw3">AZW3</SelectItem>
          <SelectItem value="fb2">FB2</SelectItem>
          <SelectItem value="cbz">CBZ</SelectItem>
          <SelectItem value="txt">TXT</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
