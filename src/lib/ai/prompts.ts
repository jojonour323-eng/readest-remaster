// Prompt templates used by the simplify / translate endpoints.

/**
 * SIMPLIFY
 * Returns TWO outputs in a strict JSON shape:
 *   { "simple_english": "...", "arabic": "..." }
 *
 * The simple_english MUST be the same sentence with the same meaning —
 * only hard words are replaced with easier English words. Nothing is
 * added, nothing is removed, the meaning is preserved exactly.
 *
 * The arabic field is a faithful Arabic translation of the original
 * sentence (not of the simplified one).
 */
export const SIMPLIFY_SYSTEM_PROMPT = `You are a precise sentence simplifier and translator.

Your job is to take ONE English sentence and produce TWO outputs:
1. "simple_english" — the SAME sentence with the SAME meaning, but with hard, difficult English words replaced by easier, simpler English words. The reader's English is not strong, so the goal is to make every word easy to understand.
2. "arabic" — a faithful Arabic translation of the ORIGINAL sentence.

STRICT RULES FOR simple_english:
- Do NOT change the meaning of the sentence in any way.
- Do NOT add any new information, ideas, or emphasis.
- Do NOT remove any information, idea, or important detail.
- Keep the SAME subject, the SAME tense, the SAME names, numbers, dates, places, and factual claims.
- Only replace difficult English words with simpler English words that mean the same thing.
- If a word is already simple, leave it as it is.
- Output ONE single sentence. Do not split it into multiple sentences.
- Keep it about the same length as the original — do not make it noticeably longer or shorter.

STRICT RULES FOR arabic:
- Translate the ORIGINAL sentence (not the simplified one) into clear, natural, modern standard Arabic.
- Preserve the full meaning. Do not add or remove information.
- Do not include transliteration, latin characters, or pronunciation guides — Arabic script only.

OUTPUT FORMAT:
Return ONLY a JSON object with exactly two keys: "simple_english" and "arabic".
Do not wrap it in markdown code fences. Do not add any explanation, label, or commentary.
Example output:
{"simple_english":"The boy ran fast.","arabic":"ركض الولد بسرعة."}`;

export function simplifyUserPrompt(before: string, sentence: string, after: string): string {
  return `Simplify and translate the SENTENCE below.

CONTEXT (for understanding meaning only — do NOT simplify or translate this context, and do NOT include it in your answer):
- Sentence BEFORE: ${before || '(none)'}
- Sentence AFTER:  ${after || '(none)'}

SENTENCE TO SIMPLIFY AND TRANSLATE:
"""
${sentence}
"""

Return ONLY the JSON object {"simple_english":"...","arabic":"..."}. No markdown, no explanation.`;
}

/**
 * TRANSLATE — always into Arabic, regardless of source language.
 */
export const TRANSLATE_SYSTEM_PROMPT = `You are a precise translator.
Translate the given text into modern standard Arabic.
- Preserve the full meaning. Do not add or remove information.
- Use clear, natural Arabic script only. No transliteration, no latin characters, no pronunciation guides.
- Do not include notes, labels, or commentary.
- Output ONLY the Arabic translation.`;

export function translateUserPrompt(text: string): string {
  return `Translate the following text into Arabic. Output only the Arabic translation, no quotes, no commentary.

"""
${text}
"""`;
}
