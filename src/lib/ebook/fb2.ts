'use client';

import JSZip from 'jszip';

export interface Fb2Meta {
  title: string;
  author: string;
  cover?: string;
}

export async function extractFb2Meta(data: ArrayBuffer): Promise<Fb2Meta> {
  const text = decodeFb2(data);
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const title =
    doc.querySelector('book-title')?.textContent?.trim() ||
    doc.querySelector('book > description > title-info > book-title')?.textContent?.trim() ||
    'Untitled';
  const first = doc.querySelector('author first-name')?.textContent?.trim();
  const last = doc.querySelector('author last-name')?.textContent?.trim();
  const author = [first, last].filter(Boolean).join(' ').trim() || 'Unknown author';

  let cover: string | undefined;
  const coverEl = doc.querySelector('coverpage image');
  if (coverEl) {
    const href = coverEl.getAttribute('l:href') || coverEl.getAttribute('xlink:href') || '';
    if (href.startsWith('#')) {
      const id = href.slice(1);
      const binary = Array.from(doc.querySelectorAll('binary')).find(
        (b) => b.getAttribute('id') === id,
      );
      if (binary) {
        const ct = binary.getAttribute('content-type') || 'image/jpeg';
        cover = `data:${ct};base64,${binary.textContent?.replace(/\s/g, '') ?? ''}`;
      }
    }
  }
  return { title, author, cover };
}

export function decodeFb2(data: ArrayBuffer): string {
  // FB2 is UTF-8 by spec; fall back to windows-1251 if invalid.
  const utf8 = new TextDecoder('utf-8').decode(data);
  if (/<?xml/.test(utf8) && /encoding=["']?utf-8/i.test(utf8.slice(0, 200))) return utf8;
  if (/encoding=["']?windows-1251/i.test(utf8.slice(0, 200))) {
    return new TextDecoder('windows-1251').decode(data);
  }
  return utf8;
}

// Convert FB2 to simple HTML for rendering in the reader.
export function fb2ToHtml(data: ArrayBuffer): string {
  const xml = decodeFb2(data);
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) {
    // Treat as plain text
    return `<pre>${escapeHtml(xml)}</pre>`;
  }
  const body = doc.querySelector('body[name=notes]') ? null : doc.querySelector('body');
  const target = body || doc.querySelector('body');
  if (!target) return '<p>(empty)</p>';
  const out: string[] = [];
  target.childNodes.forEach((node) => out.push(walkFb2(node)));
  return out.join('');
}

function walkFb2(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const inner = Array.from(el.childNodes).map(walkFb2).join('');
  switch (tag) {
    case 'p':
      return `<p>${inner}</p>`;
    case 'title':
    case 'subtitle':
      return `<h2>${inner}</h2>`;
    case 'section':
      return `<section>${inner}</section>`;
    case 'emphasis':
      return `<em>${inner}</em>`;
    case 'strong':
      return `<strong>${inner}</strong>`;
    case 'strikethrough':
      return `<s>${inner}</s>`;
    case 'code':
      return `<code>${inner}</code>`;
    case 'image': {
      const href = el.getAttribute('l:href') || el.getAttribute('xlink:href') || '';
      if (href.startsWith('#')) {
        return `<img alt="" data-fb2-id="${href.slice(1)}" />`;
      }
      return '';
    }
    case 'poem':
    case 'stanza':
    case 'epigraph':
      return `<div class="fb2-${tag}">${inner}</div>`;
    case 'v':
      return `<div class="fb2-v">${inner}</div>`;
    case 'a': {
      const href = el.getAttribute('l:href') || el.getAttribute('xlink:href') || '#';
      return `<a href="${escapeAttr(href)}">${inner}</a>`;
    }
    case 'binary':
      return ''; // skip raw binaries in body
    default:
      return inner;
  }
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
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

export async function extractFb2PlainText(data: ArrayBuffer): Promise<string> {
  const html = fb2ToHtml(data);
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

// Replace FB2 <img data-fb2-id> with embedded base64 binaries.
export async function materializeFb2Images(html: string, data: ArrayBuffer): Promise<string> {
  const xml = decodeFb2(data);
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const map = new Map<string, string>();
  doc.querySelectorAll('binary').forEach((b) => {
    const id = b.getAttribute('id') || '';
    const ct = b.getAttribute('content-type') || 'image/jpeg';
    if (id) map.set(id, `data:${ct};base64,${(b.textContent || '').replace(/\s/g, '')}`);
  });
  return html.replace(/data-fb2-id="([^"]+)"/g, (_, id) => {
    const url = map.get(id);
    return url ? `src="${url}"` : '';
  });
}

// Keep import used for tree-shaking clarity in some bundlers
export const _jszip = JSZip;
