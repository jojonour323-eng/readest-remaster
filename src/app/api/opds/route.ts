import { NextRequest, NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import type { OpdsCatalog, OpdsEntry } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

// GET /api/opds?url=<encoded>&as=feed|download
// Acts as a CORS proxy and partial OPDS parser.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/atom+xml, application/xml; charset=utf-8' },
      redirect: 'follow',
    });
    if (!res.ok) {
      return NextResponse.json({ error: `HTTP ${res.status}` }, { status: 502 });
    }
    const ct = res.headers.get('content-type') || 'application/xml';
    if (req.nextUrl.searchParams.get('as') === 'download') {
      const buf = Buffer.from(await res.arrayBuffer());
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'content-type': ct,
          'content-disposition': 'attachment',
        },
      });
    }
    const xml = await res.text();
    const feed = parseOpdsFeed(xml, url);
    return NextResponse.json(feed, { headers: { 'content-type': 'application/json' } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    console.error('opds API error', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function parseOpdsFeed(xml: string, baseUrl: string): OpdsCatalog {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'entry' || name === 'link' || name === 'author',
  });
  const doc = parser.parse(xml);
  const feed = doc?.feed ?? {};
  const title = String(feed.title ?? 'OPDS Catalog');

  const navLinks: { title: string; href: string }[] = [];
  const feedLinks = Array.isArray(feed.link) ? feed.link : feed.link ? [feed.link] : [];
  feedLinks.forEach((l: Record<string, unknown>) => {
    const rel = String(l['@_rel'] || '');
    const href = String(l['@_href'] || '');
    const lt = String(l['@_title'] || rel);
    if (rel === 'subsection' || rel === 'http://opds-spec.org/catalog' || rel === 'next' || rel === 'previous') {
      if (href) navLinks.push({ title: lt, href: resolveUrl(href, baseUrl) });
    }
  });

  const entries: OpdsEntry[] = [];
  const feedEntries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];
  feedEntries.forEach((entry: Record<string, unknown>, idx: number) => {
    const id = String(entry.id ?? `e${idx}`);
    const title = asText(entry.title);
    const authorRaw = entry.author as { name?: string | { '#text'?: string } } | undefined;
    const author = authorRaw?.name ? asText(authorRaw.name) : '';
    const summary = asText(entry.summary ?? entry.content ?? '');
    let cover: string | undefined;
    let downloadUrl = '';
    let acquisition = '';
    let format: OpdsEntry['format'] | undefined;
    let navHref: string | undefined;

    const links = Array.isArray(entry.link) ? entry.link : entry.link ? [entry.link] : [];
    links.forEach((l: Record<string, unknown>) => {
      const rel = String(l['@_rel'] || '');
      const href = String(l['@_href'] || '');
      const type = String(l['@_type'] || '');
      if (rel.includes('image/thumbnail') || rel === 'thumbnail' || rel === 'http://opds-spec.org/image/thumbnail') {
        if (href) cover = resolveUrl(href, baseUrl);
      } else if (rel === 'http://opds-spec.org/image' || rel === 'image') {
        if (href && !cover) cover = resolveUrl(href, baseUrl);
      } else if (rel.includes('acquisition')) {
        if (!downloadUrl) {
          downloadUrl = resolveUrl(href, baseUrl);
          acquisition = type;
          format = mimeToFormat(type);
        }
      } else if (rel === 'subsection' || rel === 'http://opds-spec.org/catalog' || rel === 'alternate') {
        if (href && !navHref) navHref = resolveUrl(href, baseUrl);
      }
    });
    // Bare link without rel for acquisition (some feeds do this)
    if (!downloadUrl && !navHref) {
      links.forEach((l: Record<string, unknown>) => {
        const type = String(l['@_type'] || '');
        const href = String(l['@_href'] || '');
        if (href && (type.includes('epub') || type.includes('pdf') || type.includes('mobipocket'))) {
          downloadUrl = resolveUrl(href, baseUrl);
          format = mimeToFormat(type);
        }
      });
    }
    // If this is a navigation entry (no download URL but has a subsection link),
    // treat it as a nav link rather than a book entry.
    if (!downloadUrl && navHref) {
      navLinks.push({ title, href: navHref });
      return;
    }
    entries.push({ id, title, author, summary, cover, downloadUrl, format, acquisition });
  });

  return { title, entries, navLinks };
}

function asText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    const obj = v as { '#text'?: unknown; text?: unknown; _?: unknown };
    if (obj['#text'] != null) return asText(obj['#text']);
    if (obj.text != null) return asText(obj.text);
    if (obj._ != null) return asText(obj._);
    // Object with no text — fall back to JSON for debugging
    try { return ''; } catch { return ''; }
  }
  return '';
}

function mimeToFormat(mime: string): OpdsEntry['format'] | undefined {
  if (mime.includes('epub')) return 'epub';
  if (mime.includes('mobipocket')) return 'mobi';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('fb2')) return 'fb2';
  if (mime.includes('cbz')) return 'cbz';
  if (mime.includes('plain')) return 'txt';
  return undefined;
}
