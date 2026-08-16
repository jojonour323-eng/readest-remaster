'use client';

/**
 * Sentence-context utilities shared by EPUB and HTML readers.
 *
 * The reader uses whatever text the user actually selects — we do NOT
 * auto-expand or "snap" the visible selection to a full sentence. But we
 * DO quietly compute the sentence immediately before and the sentence
 * immediately after the selection, so the AI has context to preserve the
 * original meaning. This never changes what's highlighted on the page.
 */

// Characters that end a sentence. We treat them as sentence boundaries
// only when followed by whitespace or end-of-text (so "Mr." stays inside
// its sentence).
const SENTENCE_ENDERS = /[.!?。！？؟]/;

export interface SentenceContext {
  /** The sentence immediately before the selection (for AI context only). */
  before: string;
  /** The sentence immediately after the selection (for AI context only). */
  after: string;
}

/**
 * Given a selection range, compute the sentence immediately before and the
 * sentence immediately after it. The visible selection is NOT modified.
 *
 * Returns empty strings if the surrounding text cannot be determined.
 */
export function computeSentenceContext(range: Range, root: Element): SentenceContext {
  const doc = range.commonAncestorContainer.ownerDocument;
  if (!doc) return { before: '', after: '' };

  // Build a list of TEXT nodes inside root, in document order.
  const textNodes: Text[] = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      return node.textContent && node.textContent.trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  let n: Node | null = walker.nextNode();
  while (n) {
    textNodes.push(n as Text);
    n = walker.nextNode();
  }
  if (textNodes.length === 0) return { before: '', after: '' };

  // Concatenate all text with node boundaries so we can map back.
  const pieces: string[] = [];
  let totalLen = 0;
  const nodeStartOffsets: number[] = [];
  for (const t of textNodes) {
    nodeStartOffsets.push(totalLen);
    const txt = t.textContent || '';
    pieces.push(txt);
    totalLen += txt.length;
  }
  const fullText = pieces.join('');

  // Map the selection's start and end into the full-text coordinate space.
  const startNodeIdx = findTextNodeIndex(textNodes, range.startContainer);
  const endNodeIdx = findTextNodeIndex(textNodes, range.endContainer);
  if (startNodeIdx === -1 || endNodeIdx === -1) return { before: '', after: '' };

  const startOffsetInFull = nodeStartOffsets[startNodeIdx] + Math.min(range.startOffset, (textNodes[startNodeIdx].textContent || '').length);
  const endOffsetInFull = nodeStartOffsets[endNodeIdx] + Math.min(range.endOffset, (textNodes[endNodeIdx].textContent || '').length);

  // The "before" context: the last complete sentence that ends before the
  // selection start.
  const beforeText = fullText.slice(0, startOffsetInFull);
  const before = lastSentenceBefore(beforeText);

  // The "after" context: the first complete sentence that starts after the
  // selection end.
  const afterText = fullText.slice(endOffsetInFull);
  const after = firstSentenceAfter(afterText);

  return { before, after };
}

function findTextNodeIndex(textNodes: Text[], node: Node): number {
  let idx = textNodes.findIndex((t) => t === node);
  if (idx === -1) {
    // node might be an element; find the first text node it contains
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!el) return -1;
    idx = textNodes.findIndex((t) => el.contains(t));
  }
  return idx;
}

/**
 * Find the last complete sentence that ends before `pos` in `text`.
 * A sentence ends at a sentence-ender followed by whitespace.
 */
function lastSentenceBefore(text: string): string {
  if (!text.trim()) return '';
  // Walk from the end, find the last sentence-ender+whitespace boundary.
  // The "last sentence before" is everything from that boundary to the end
  // of `text`, trimmed.
  let i = text.length;
  while (i > 0) {
    i--;
    if (SENTENCE_ENDERS.test(text[i])) {
      // Check there's whitespace after this ender (before pos)
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (j < text.length) {
        // The sentence after this ender starts at j.
        return text.slice(j).trim().slice(-300);
      }
      // otherwise this ender is the last char; no complete sentence before.
    }
  }
  // No ender found — return the whole thing (trimmed, capped).
  return text.trim().slice(-300);
}

/**
 * Find the first complete sentence that starts at or after `pos` in `text`.
 */
function firstSentenceAfter(text: string): string {
  if (!text.trim()) return '';
  // Skip leading whitespace.
  let start = 0;
  while (start < text.length && /\s/.test(text[start])) start++;
  // Find the next sentence-ender that is followed by whitespace or EOL.
  let i = start;
  while (i < text.length) {
    if (SENTENCE_ENDERS.test(text[i])) {
      let j = i + 1;
      while (j < text.length && /["'”’)\]]/.test(text[j])) j++;
      if (j >= text.length || /\s/.test(text[j])) {
        return text.slice(start, j).trim().slice(0, 300);
      }
      // inline abbreviation — keep scanning
    }
    i++;
  }
  // No ender found — return the rest, trimmed.
  return text.slice(start).trim().slice(0, 300);
}
