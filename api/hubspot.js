module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'Config manquante' });

  const { firstname, lastname, email, phone, city, stage, roi, revM, net, invest, pbkY, nb, qualification } = req.body || {};
  if (!email || !firstname || !lastname) return res.status(400).json({ error: 'Champs requis' });

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
    const https = require('https');
    const body = JSON.stringify({
      properties: { firstname, lastname, email, phone: phone || '', city: city || '', message: roiSummary }
    });

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.hubapi.com',
        path: '/crm/v3/objects/contacts',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 7000
      };
      const reqHttp = https.request(options, (r) => {
        let raw = '';
        r.on('data', (c) => raw += c);
        r.on('end', () => {
          try { resolve({ status: r.statusCode, data: JSON.parse(raw) }); }
          catch (e) { resolve({ status: r.statusCode, data: raw }); }
        });
      });
      reqHttp.on('timeout', () => { reqHttp.destroy(); reject(new Error('HubSpot timeout')); });
      reqHttp.on('error', reject);
      reqHttp.write(body);
      reqHttp.end();
    });

    console.log('HubSpot:', result.status, JSON.stringify(result.data));

    if (result.status >= 400) return res.status(500).json({ error: 'Contact failed', detail: result.data });
    return res.status(200).json({ ok: true, contactId: result.data.id });

  } catch (err) {
    console.error('HubSpot error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
