import { NextRequest, NextResponse } from 'next/server';
import { generateContent } from '@/lib/ai/gemini';
import { SIMPLIFY_SYSTEM_PROMPT, simplifyUserPrompt } from '@/lib/ai/prompts';

export const runtime = 'nodejs';

interface SimplifyResponse {
  simple_english: string;
  arabic: string;
}

/**
 * Extract the JSON object {simple_english, arabic} from the model's reply.
 * The model is asked to return pure JSON, but we defensively handle minor
 * deviations (markdown fences, extra prose).
 */
function parseSimplifyReply(content: string): SimplifyResponse | null {
  const trimmed = content.trim();
  // Strip markdown code fences if present
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  // Find the first { ... } block
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const jsonStr = candidate.slice(start, end + 1);
  try {
    const obj = JSON.parse(jsonStr) as Partial<SimplifyResponse>;
    const simple_english = (obj.simple_english ?? obj.simpleEnglish ?? obj.simple ?? '').toString().trim();
    const arabic = (obj.arabic ?? obj.arabicTranslation ?? '').toString().trim();
    if (!simple_english && !arabic) return null;
    return { simple_english, arabic };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const sentence: string = (body && typeof body === 'object' && 'sentence' in body ? String((body as Record<string, unknown>).sentence) : '').toString();
  const before: string = (body && typeof body === 'object' && 'before' in body ? String((body as Record<string, unknown>).before) : '').toString();
  const after: string = (body && typeof body === 'object' && 'after' in body ? String((body as Record<string, unknown>).after) : '').toString();

  if (!sentence.trim()) {
    return NextResponse.json({ error: 'sentence is required' }, { status: 400 });
  }

  try {
    const content = await generateContent({
      systemPrompt: SIMPLIFY_SYSTEM_PROMPT,
      userPrompt: simplifyUserPrompt(before, sentence, after),
      temperature: 0.2,
      maxOutputTokens: 600,
    });
    const parsed = parseSimplifyReply(content);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Could not parse the AI response into JSON. Please try again.', raw: content.slice(0, 500) },
        { status: 502 },
      );
    }
    return NextResponse.json(parsed);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    console.error('simplify API error', e);
    // Return the REAL error message so the frontend can display the cause
    // (e.g. missing API key, quota exceeded, network failure).
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
