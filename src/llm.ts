import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = process.env.LLM_MODEL ?? 'claude-haiku-4-5-20251001';

export async function llmCall(system: string, userMessage: string): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });

  const block = response.content[0];
  if (block.type === 'text') return block.text;
  throw new Error('Unexpected response block type');
}

export function parseJsonResponse<T>(raw: string): T {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(cleaned);
}
