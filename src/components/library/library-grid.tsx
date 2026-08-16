'use client';

import { BookCard } from './book-card';
import type { BookMeta } from '@/lib/types';

export function LibraryGrid({ books }: { books: BookMeta[] }) {
  return (
    <div
      role="list"
      aria-label="Books in library"
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
    >
      {books.map((b) => (
        <BookCard key={b.id} book={b} />
      ))}
    </div>
  );
}
