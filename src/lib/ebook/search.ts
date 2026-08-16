'use client';

import type { BookMeta } from '../types';
import { extractEpubPlainText } from './epub';
import { extractFb2PlainText } from './fb2';
import { extractMobiPlainText } from './mobi';

// Returns plain text of a book for cross-book search.
export async function extractPlainText(
  book: BookMeta,
  data: ArrayBuffer,
): Promise<string> {
  switch (book.format) {
    case 'epub':
      return extractEpubPlainText(data);
    case 'fb2':
      return extractFb2PlainText(data);
    case 'mobi':
    case 'azw3':
      return extractMobiPlainText(data);
    case 'txt': {
      const { decodeTxt } = await import('./txt');
      return decodeTxt(data);
    }
    case 'cbz':
      return '';
    default:
      return '';
  }
}
