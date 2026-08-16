'use client';

import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileText } from 'lucide-react';
import { useLibraryStore } from '@/stores/library-store';
import { toast } from 'sonner';
import type { BookFormat } from '@/lib/types';

const ACCEPT = '.epub,.mobi,.azw3,.azw,.fb2,.cbz,.cbr,.zip,.txt';

export function UploadButton({ compact = false }: { compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const addFile = useLibraryStore((s) => s.addFile);
  const openBook = useLibraryStore((s) => s.openBook);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    let firstAddedId: string | null = null;
    for (const file of files) {
      const book = await addFile(file);
      if (book && !firstAddedId) firstAddedId = book.id;
    }
    if (firstAddedId) {
      toast.success(`Added ${files.length} ${files.length === 1 ? 'book' : 'books'}`);
      openBook(firstAddedId);
    } else {
      toast.error('Could not add file. Please check the format.');
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  if (compact) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          aria-label="Upload book"
        >
          <Upload className="w-4 h-4" />
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          onChange={onChange}
          aria-hidden="true"
          tabIndex={-1}
        />
      </>
    );
  }

  return (
    <>
      <Button onClick={() => inputRef.current?.click()} size="sm">
        <Upload className="w-4 h-4 mr-2" />
        Upload book
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={onChange}
        aria-hidden="true"
        tabIndex={-1}
      />
    </>
  );
}

export const SUPPORTED_FORMATS: BookFormat[] = ['epub', 'mobi', 'azw3', 'fb2', 'cbz', 'txt'];

export function FormatBadges() {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {SUPPORTED_FORMATS.map((f) => (
        <span
          key={f}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-muted-foreground uppercase font-medium"
        >
          <FileText className="w-3 h-3" />
          {f}
        </span>
      ))}
    </div>
  );
}
