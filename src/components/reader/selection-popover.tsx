'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Highlighter,
  Languages,
  Sparkles,
  BookmarkPlus,
  Loader2,
  X,
  Copy,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import * as storage from '@/lib/storage';
import { makeId } from '@/lib/ebook/loader';
import type { Simplification, HighlightColor } from '@/lib/types';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  rect: DOMRect;
  text: string;
  before: string;
  after: string;
  bookId: string;
  cfiRange: string;
  onClose: () => void;
  onHighlight: (color: HighlightColor) => void;
  onAnnotation?: (cfiRange: string, kind: 'simplify' | 'translate') => void;
}

const HIGHLIGHT_COLORS: { color: HighlightColor; className: string; label: string }[] = [
  { color: 'yellow', className: 'bg-yellow-300', label: 'Yellow' },
  { color: 'green', className: 'bg-green-300', label: 'Green' },
  { color: 'blue', className: 'bg-blue-300', label: 'Blue' },
  { color: 'pink', className: 'bg-pink-300', label: 'Pink' },
  { color: 'purple', className: 'bg-purple-300', label: 'Purple' },
];

type PanelKind = 'toolbar' | 'simplify' | 'translate' | null;

export function SelectionPopover({
  rect,
  text,
  before,
  after,
  bookId,
  cfiRange,
  onClose,
  onHighlight,
  onAnnotation,
}: Props) {
  // Single source of truth for what's on screen:
  //   'toolbar'    -> the action toolbar (Simplify/Highlight/Translate/Copy)
  //   'simplify'   -> the simplified-sentence result panel
  //   'translate'  -> the Arabic translation result panel
  //   null         -> nothing (component will unmount via parent)
  const [panel, setPanel] = useState<PanelKind>('toolbar');
  const [simpleEnglish, setSimpleEnglish] = useState<string>('');
  const [arabicFromSimplify, setArabicFromSimplify] = useState<string>('');
  const [simplifyLoading, setSimplifyLoading] = useState(false);
  const [arabicFromTranslate, setArabicFromTranslate] = useState<string>('');
  const [translateLoading, setTranslateLoading] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Position the popover above the selection
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.max(8, rect.top - 56),
    left: Math.max(8, Math.min(window.innerWidth - 360, rect.left + rect.width / 2 - 175)),
    zIndex: 60,
  };

  // Reset transient state when the underlying selection changes.
  // We do NOT clear `panel` here — the parent unmounts us when selection is
  // cleared, which is the proper teardown path.
  useEffect(() => {
    setSimpleEnglish('');
    setArabicFromSimplify('');
    setArabicFromTranslate('');
    setSimplifyLoading(false);
    setTranslateLoading(false);
  }, [text, cfiRange]);

  const callSimplify = async () => {
    setSimplifyLoading(true);
    try {
      const res = await fetch('/api/simplify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence: text, before, after }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surface the real error message returned by the API (e.g. missing
        // API key, quota exceeded) instead of a generic "HTTP 500".
        const msg = (data?.error ?? `HTTP ${res.status}`).toString();
        throw new Error(msg);
      }
      const simple: string = (data?.simple_english ?? '').toString().trim();
      const arabic: string = (data?.arabic ?? '').toString().trim();
      if (!simple && !arabic) throw new Error('The AI returned an empty response. Please try again.');
      setSimpleEnglish(simple);
      setArabicFromSimplify(arabic);
      // Switch from toolbar to the result panel. This KEEPS the popover
      // mounted (parent only unmounts when both selection AND panel are null).
      setPanel('simplify');
      // Save simplification to IndexedDB
      const rec: Simplification = {
        id: makeId(),
        bookId,
        original: text,
        simplified: simple || arabic, // store whatever we got
        beforeContext: before,
        afterContext: after,
        cfiRange,
        createdAt: Date.now(),
      };
      await storage.saveSimplification(rec);
      onAnnotation?.(cfiRange, 'simplify');
      // No success notification — the result panel appearing IS the feedback.
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Simplify failed';
      toast.error(msg);
    } finally {
      setSimplifyLoading(false);
    }
  };

  const callTranslate = async () => {
    setTranslateLoading(true);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }), // target language is always Arabic on the server
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surface the real error message returned by the API.
        const msg = (data?.error ?? `HTTP ${res.status}`).toString();
        throw new Error(msg);
      }
      const out: string = (data?.translated ?? '').toString().trim();
      if (!out) throw new Error('The AI returned an empty response. Please try again.');
      setArabicFromTranslate(out);
      setPanel('translate');
      onAnnotation?.(cfiRange, 'translate');
      // No success notification — the result panel appearing IS the feedback.
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Translate failed';
      toast.error(msg);
    } finally {
      setTranslateLoading(false);
    }
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      // No success notification — copy is silent.
    } catch {
      toast.error('Copy failed');
    }
  };

  const onSaveNote = async () => {
    if (!noteText.trim()) return;
    await storage.saveHighlight({
      id: makeId(),
      bookId,
      cfiRange,
      text,
      color: 'yellow',
      note: noteText.trim(),
      createdAt: Date.now(),
      beforeText: before,
      afterText: after,
    });
    onHighlight('yellow');
    setNoteText('');
    setNoteOpen(false);
    // No success notification — the note is saved silently.
  };

  // When user dismisses the result panel, fully close (parent will unmount).
  const closeAll = () => {
    setPanel(null);
    onClose();
  };

  return (
    <>
      {/* Toolbar (Simplify / Highlight / Translate to Arabic / Copy / Close) */}
      {panel === 'toolbar' && (
        <div
          ref={popoverRef}
          id="selection-popover"
          role="toolbar"
          aria-label="Text selection actions"
          style={style}
          className="flex items-center gap-1 bg-popover border rounded-lg shadow-lg p-1"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={callSimplify}
            disabled={simplifyLoading}
            className="text-foreground hover:bg-accent"
            aria-label="Simplify this sentence"
            title="Simplify"
          >
            {simplifyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span className="ml-1 text-xs">Simplify</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Highlight selection">
                <Highlighter className="w-4 h-4" />
                <span className="ml-1 text-xs">Highlight</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {HIGHLIGHT_COLORS.map((c) => (
                <DropdownMenuItem key={c.color} onClick={() => onHighlight(c.color)}>
                  <span className={`w-4 h-4 rounded mr-2 ${c.className}`} />
                  {c.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => setNoteOpen(true)}>
                <BookmarkPlus className="w-4 h-4 mr-2" /> Add note…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            onClick={callTranslate}
            disabled={translateLoading}
            aria-label="Translate selection to Arabic"
            title="Translate to Arabic"
          >
            {translateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
            <span className="ml-1 text-xs">Translate</span>
          </Button>

          <Button variant="ghost" size="sm" onClick={onCopy} aria-label="Copy selection">
            <Copy className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={closeAll} aria-label="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Simplify result panel — shows simple English + Arabic only (no original) */}
      {panel === 'simplify' && (
        <div
          role="region"
          aria-label="Simplified sentence"
          style={{
            position: 'fixed',
            top: Math.min(window.innerHeight - 320, rect.bottom + 12),
            left: Math.max(8, Math.min(window.innerWidth - 440, rect.left + rect.width / 2 - 210)),
            zIndex: 61,
          }}
          className="w-[420px] bg-popover border rounded-lg shadow-xl p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/70">
              <Sparkles className="w-3.5 h-3.5" />
              Simplified
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeAll} aria-label="Close simplify panel">
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="space-y-4">
            {simpleEnglish && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 font-medium">Simple English</div>
                <div
                  className="text-foreground leading-relaxed"
                  dir="ltr"
                  style={{ fontSize: '16px', fontWeight: 400 }}
                >
                  {simpleEnglish}
                </div>
              </div>
            )}
            {arabicFromSimplify && (
              <div className="pt-2 border-t border-border/50">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 font-medium">Arabic</div>
                <div
                  className="text-foreground leading-loose"
                  dir="rtl"
                  style={{ fontSize: '17px', fontWeight: 400, fontFamily: '"Noto Naskh Arabic", "Noto Sans Arabic", "Segoe UI", Arial, sans-serif' }}
                >
                  {arabicFromSimplify}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(simpleEnglish + (arabicFromSimplify ? '\n' + arabicFromSimplify : ''));
                  } catch {
                    toast.error('Copy failed');
                  }
                }}
              >
                <Copy className="w-3.5 h-3.5 mr-1" /> Copy
              </Button>
              <Button variant="ghost" size="sm" onClick={callSimplify} disabled={simplifyLoading}>
                {simplifyLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                Try again
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Translate result panel — shows Arabic translation only */}
      {panel === 'translate' && (
        <div
          role="region"
          aria-label="Translation"
          style={{
            position: 'fixed',
            top: Math.min(window.innerHeight - 280, rect.bottom + 12),
            left: Math.max(8, Math.min(window.innerWidth - 440, rect.left + rect.width / 2 - 210)),
            zIndex: 61,
          }}
          className="w-[420px] bg-popover border rounded-lg shadow-xl p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/70">
              <Languages className="w-3.5 h-3.5" />
              Arabic Translation
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeAll} aria-label="Close translate panel">
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 font-medium">العربية</div>
              <div
                className="text-foreground leading-loose"
                dir="rtl"
                style={{ fontSize: '17px', fontWeight: 400, fontFamily: '"Noto Naskh Arabic", "Noto Sans Arabic", "Segoe UI", Arial, sans-serif' }}
              >
                {arabicFromTranslate}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(arabicFromTranslate);
                  } catch {
                    toast.error('Copy failed');
                  }
                }}
              >
                <Copy className="w-3.5 h-3.5 mr-1" /> Copy
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Note dialog */}
      <Popover open={noteOpen} onOpenChange={setNoteOpen}>
        <PopoverTrigger asChild>
          <button className="sr-only" aria-hidden="true" tabIndex={-1} />
        </PopoverTrigger>
        <PopoverContent className="w-80" align="center">
          <div className="space-y-2">
            <div className="text-sm font-medium">Add a note</div>
            <Textarea
              autoFocus
              placeholder="Write your note about this passage…"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setNoteOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={onSaveNote}>Save note</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
