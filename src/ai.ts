// ============================================
// اتصال به API هوش مصنوعی
// ============================================

import { Env, ChatMessage } from './types';

export async function callAI(
  env: Env,
  messages: ChatMessage[],
  model?: string
): Promise<string> {
  const systemPrompt = env.SYSTEM_PROMPT || 'You are a helpful AI assistant.';

  const payload = {
    model: model || env.MODEL_NAME || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    max_tokens: 2048,
    temperature: 0.7,
  };

  const baseUrl = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const apiKey = env.OPENAI_API_KEY;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content || 'جوابی دریافت نشد.';
}
