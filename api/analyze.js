module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'No prompt' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(200).json({ analysis: null });

  try {
    const https = require('https');
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    });

    const analysis = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 8000
      };
      const reqHttp = https.request(options, (r) => {
        let raw = '';
        r.on('data', (c) => raw += c);
        r.on('end', () => {
          try {
            const data = JSON.parse(raw);
            resolve(data?.content?.[0]?.text || null);
          } catch (e) { resolve(null); }
        });
      });
      reqHttp.on('timeout', () => { reqHttp.destroy(); resolve(null); });
      reqHttp.on('error', () => resolve(null));
      reqHttp.write(body);
      reqHttp.end();
    });

    return res.status(200).json({ analysis });
  } catch (e) {
    return res.status(200).json({ analysis: null });
  }
};
