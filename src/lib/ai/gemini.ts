/**
 * Google Gemini API client.
 *
 * This replaces the private z-ai-web-dev-sdk package with a plain fetch()
 * call to Google's public Gemini API endpoint, so the app can be deployed
 * anywhere (Vercel, Railway, etc.) without sandbox-only dependencies.
 *
 * Configuration via environment variables:
 *   GEMINI_API_KEY  (required) — get a free key at https://aistudio.google.com/apikey
 *   GEMINI_MODEL     (optional) — defaults to "gemini-flash-lite-latest",
 *                                 an alias that stays current automatically.
 */

const DEFAULT_MODEL = 'gemini-flash-lite-latest';

export interface GeminiMessage {
  role: 'user' | 'model';
  text: string;
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !key.trim()) {
    throw new Error(
      'GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey and add it to your .env file as GEMINI_API_KEY=...',
    );
  }
  return key.trim();
}

function getModel(): string {
  return (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
}

interface GenerateOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
    blockReasonMessage?: string;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

/**
 * Calls Google Gemini's generateContent endpoint and returns the text of
 * the first candidate's first part. Throws an Error with a human-readable
 * message (suitable for surfacing to the user via the API JSON "error"
 * field) if the call fails for any reason.
 */
export async function generateContent(opts: GenerateOptions): Promise<string> {
  const apiKey = getApiKey();
  const model = getModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    systemInstruction: {
      parts: [{ text: opts.systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: opts.userPrompt }],
      },
    ],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
    },
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Network error contacting Gemini API: ${msg}`);
  }

  let data: GeminiResponse;
  try {
    data = (await res.json()) as GeminiResponse;
  } catch {
    throw new Error(`Gemini API returned a non-JSON response (HTTP ${res.status}).`);
  }

  // Google returns HTTP 200 even for some errors, but includes an `error` field.
  if (data.error) {
    const msg = data.error.message || `Gemini API error (status: ${data.error.status || 'unknown'})`;
    throw new Error(msg);
  }
  if (!res.ok) {
    throw new Error(`Gemini API returned HTTP ${res.status}.`);
  }

  // Blocked prompts
  if (data.promptFeedback?.blockReason) {
    const reason = data.promptFeedback.blockReasonMessage || data.promptFeedback.blockReason;
    throw new Error(`The prompt was blocked by Gemini: ${reason}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || !text.trim()) {
    const finishReason = data.candidates?.[0]?.finishReason;
    throw new Error(
      `Gemini returned an empty response${finishReason ? ` (finish reason: ${finishReason})` : ''}.`,
    );
  }
  return text.trim();
}
