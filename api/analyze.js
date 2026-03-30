// api/analyze.js — Vercel Edge Function
export const config = { runtime: 'edge' };

export default async function handler(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  const body = await request.json();
  const { prompt } = body || {};
  if (!prompt) {
    return new Response(JSON.stringify({ error: 'No prompt' }), { status: 400, headers: corsHeaders });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ analysis: null }), { status: 200, headers: corsHeaders });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', response.status, err);
      return new Response(JSON.stringify({ analysis: null }), { status: 200, headers: corsHeaders });
    }

    const data = await response.json();
    const analysis = data?.content?.[0]?.text || null;
    return new Response(JSON.stringify({ analysis }), { status: 200, headers: corsHeaders });

  } catch (err) {
    console.error('analyze error:', err.message);
    return new Response(JSON.stringify({ analysis: null }), { status: 200, headers: corsHeaders });
  }
}
