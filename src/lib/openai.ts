import "server-only";

/**
 * Sends a system+user prompt to OpenAI chat completions in JSON mode and
 * returns the parsed object. Shared by lead-intelligence search, enrichment
 * and insights — see src/lib/firecrawl.ts for the original inline version
 * of this pattern.
 */
export async function chatJSON<T = Record<string, unknown>>(
  system: string,
  user: string,
  options?: { temperature?: number; model?: string }
): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY ni nastavljen v .env.local.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options?.model ?? "gpt-4o-mini",
      temperature: options?.temperature ?? 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI napaka (${response.status}): ${text.slice(0, 300)}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI ni vrnil odgovora.");
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error("Odgovora AI ni bilo mogoče razčleniti.");
  }
}

/**
 * Same as chatJSON, but attaches one or more images (data URLs) to the user
 * message so a vision-capable model can read them — used for "extract
 * fields from a photo/screenshot" flows like the lead-intelligence image
 * import, including multi-image batches.
 */
export async function chatJSONWithImages<T = Record<string, unknown>>(
  system: string,
  userText: string,
  imageDataUrls: string[],
  options?: {
    temperature?: number;
    model?: string;
    imageDetail?: "low" | "high" | "auto";
  }
): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY ni nastavljen v .env.local.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options?.model ?? "gpt-4o-mini",
      temperature: options?.temperature ?? 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            ...imageDataUrls.map((url) => ({
              type: "image_url" as const,
              image_url: { url, detail: options?.imageDetail ?? "high" },
            })),
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI napaka (${response.status}): ${text.slice(0, 300)}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI ni vrnil odgovora.");
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error("Odgovora AI ni bilo mogoče razčleniti.");
  }
}

/** Single-image convenience wrapper around chatJSONWithImages. */
export async function chatJSONWithImage<T = Record<string, unknown>>(
  system: string,
  userText: string,
  imageDataUrl: string,
  options?: {
    temperature?: number;
    model?: string;
    imageDetail?: "low" | "high" | "auto";
  }
): Promise<T> {
  return chatJSONWithImages<T>(system, userText, [imageDataUrl], options);
}
