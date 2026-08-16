'use client';

import JSZip from 'jszip';

export interface TxtMeta {
  title: string;
}

export function decodeTxt(data: ArrayBuffer): string {
  // Try UTF-8 first; if there are many replacement chars, fall back to windows-1252.
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(data);
  const repl = (utf8.match(/\uFFFD/g) || []).length;
  if (repl > utf8.length * 0.01) {
    try {
      return new TextDecoder('windows-1252').decode(data);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

export function txtToHtml(text: string): string {
  // Split paragraphs by blank line; single newlines -> <br/>
  const paras = text.split(/\n\s*\n/);
  return paras
    .map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br/>')}</p>`)
    .join('');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

export const _jszip = JSZip;
