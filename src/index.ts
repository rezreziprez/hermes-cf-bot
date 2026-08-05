// ============================================
// Hermes CF Bot — Cloudflare Worker Entry
// ============================================

import { handleTelegramUpdate } from './telegram';
import { Env } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // سلامت
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // تنظیم وب‌هوک تلگرام
    if (url.pathname === '/setup-webhook') {
      const token = env.TELEGRAM_BOT_TOKEN;
      const host = url.origin;
      const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `${host}/webhook`,
          allowed_updates: ['message'],
        }),
      });
      const data = await res.json() as any;
      return Response.json(data);
    }

    // وب‌هوک تلگرام
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        await handleTelegramUpdate(update as any, env);
        return new Response('OK');
      } catch (e: any) {
        console.error('Webhook error:', e.message);
        return new Response('Error', { status: 500 });
      }
    }

    return new Response('Hermes CF Bot is running!', { status: 200 });
  },
};
