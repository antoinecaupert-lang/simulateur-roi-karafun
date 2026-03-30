// api/hubspot.js — Vercel serverless function
const https = require('https');

function post(url, token, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 6000
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'Config manquante' });

  const { firstname, lastname, email, phone, city, stage, roi, revM, net, invest, pbkY, nb, qualification } = req.body || {};
  if (!email || !firstname || !lastname) return res.status(400).json({ error: 'Champs requis manquants' });

  const roiSummary = [
    'ROI : ' + (roi ? Number(roi).toFixed(1) + '%' : 'N/A'),
    'CA/mois : ' + (revM ? Math.round(revM) + ' EUR' : 'N/A'),
    'Net/mois : ' + (net ? Math.round(net) + ' EUR' : 'N/A'),
    'Invest : ' + (invest ? Math.round(invest) + ' EUR' : 'N/A'),
    'Retour : ' + (pbkY && isFinite(pbkY) ? Number(pbkY).toFixed(1) + ' ans' : 'N/A'),
    'Boxes : ' + (nb || 'N/A'),
    'Ville : ' + (city || 'N/A'),
    'Stade : ' + (stage || 'N/A'),
    'Qualification : ' + (qualification || 'N/A')
  ].join(' | ');

  try {
    const result = await post('https://api.hubapi.com/crm/v3/objects/contacts', token, {
      properties: { firstname, lastname, email, phone: phone || '', city: city || '', message: roiSummary }
    });
    console.log('HubSpot response:', result.status, JSON.stringify(result.body));
    if (result.status >= 400) return res.status(500).json({ error: 'Contact failed', detail: result.body });
    return res.status(200).json({ ok: true, contactId: result.body.id });
  } catch (err) {
    console.error('HubSpot error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
