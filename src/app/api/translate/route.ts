import { NextRequest, NextResponse } from 'next/server';
import { generateContent } from '@/lib/ai/gemini';
import { TRANSLATE_SYSTEM_PROMPT, translateUserPrompt } from '@/lib/ai/prompts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const text: string = (body && typeof body === 'object' && 'text' in body ? String((body as Record<string, unknown>).text) : '').toString();
  if (!text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  try {
    // Target language is ALWAYS Arabic. We ignore any client-supplied
    // targetLang to guarantee the output is Arabic.
    const translated = await generateContent({
      systemPrompt: TRANSLATE_SYSTEM_PROMPT,
      userPrompt: translateUserPrompt(text),
      temperature: 0.2,
      maxOutputTokens: 1024,
    });
    return NextResponse.json({ translated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    console.error('translate API error', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
