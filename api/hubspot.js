// api/hubspot.js — Vercel serverless function
// Crée un contact dans HubSpot CRM (simple, un seul appel)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'Config manquante' });

  const { firstname, lastname, email, phone, city, stage, roi, revM, net, invest, pbkY, nb, qualification } = req.body || {};

  if (!email || !firstname || !lastname) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  const roiSummary = [
    'ROI annuel : ' + (roi ? Number(roi).toFixed(1) + '%' : 'N/A'),
    'CA mensuel : ' + (revM ? Math.round(revM) + ' EUR' : 'N/A'),
    'Net/mois : ' + (net ? Math.round(net) + ' EUR' : 'N/A'),
    'Investissement : ' + (invest ? Math.round(invest) + ' EUR' : 'N/A'),
    'Retour invest. : ' + (pbkY && isFinite(pbkY) ? Number(pbkY).toFixed(1) + ' ans' : 'N/A'),
    'Boxes : ' + (nb || 'N/A'),
    'Ville : ' + (city || 'N/A'),
    'Stade : ' + (stage || 'N/A'),
    'Qualification : ' + (qualification || 'N/A')
  ].join('\n');

  try {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        properties: {
          firstname,
          lastname,
          email,
          phone: phone || '',
          city: city || '',
          message: roiSummary
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('HubSpot error:', JSON.stringify(data));
      return res.status(500).json({ error: 'Contact failed', detail: data });
    }

    return res.status(200).json({ ok: true, contactId: data.id });

  } catch (err) {
    console.error('HubSpot exception:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
