module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (process.env.HUBSPOT_TOKEN || '').trim();
  if (!token) return res.status(500).json({ error: 'Config manquante' });

  const { firstname, lastname, email, phone, city, stage, roi, revM, net, invest, pbkY, nb, qualification } = req.body || {};
  if (!email || !firstname || !lastname) return res.status(400).json({ error: 'Champs requis' });

  const https = require('https');

  function hubspotRequest(method, path, payload) {
    return new Promise((resolve, reject) => {
      const body = payload ? JSON.stringify(payload) : null;
      const options = {
        hostname: 'api.hubapi.com',
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
        },
        timeout: 7000
      };
      const req = https.request(options, (r) => {
        let raw = '';
        r.on('data', (c) => raw += c);
        r.on('end', () => {
          try { resolve({ status: r.statusCode, data: JSON.parse(raw) }); }
          catch (e) { resolve({ status: r.statusCode, data: raw }); }
        });
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('HubSpot timeout')); });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  try {
    // 1. Chercher le contact existant par email
    const search = await hubspotRequest('POST', '/crm/v3/objects/contacts/search', {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      properties: ['email'],
      limit: 1
    });

    let contactId;

    if (search.data.total > 0) {
      // Mettre à jour le contact existant
      contactId = search.data.results[0].id;
      await hubspotRequest('PATCH', `/crm/v3/objects/contacts/${contactId}`, {
        properties: { firstname, lastname, phone: phone || '', city: city || '' }
      });
      console.log('Contact updated:', contactId);
    } else {
      // Créer un nouveau contact
      const created = await hubspotRequest('POST', '/crm/v3/objects/contacts', {
        properties: { firstname, lastname, email, phone: phone || '', city: city || '' }
      });
      if (created.status >= 400) return res.status(500).json({ error: 'Contact creation failed', detail: created.data });
      contactId = created.data.id;
      console.log('Contact created:', contactId);
    }

    // 2. Enroller le contact dans la séquence "Suite ROI FR"
    const enrollment = await hubspotRequest('POST', '/automation/v4/sequences/enrollments', {
      sequenceId: 796519659,
      contactId: contactId,
      userId: 67082377
    });
    console.log('Sequence enrollment:', enrollment.status, JSON.stringify(enrollment.data));

    // 3. Créer le deal
    const dealName = `KaraFun X ${firstname} ${lastname}`;
    const description = [
      roi ? `ROI : ${Number(roi).toFixed(1)}%` : null,
      revM ? `CA/mois : ${Math.round(revM)} EUR` : null,
      net ? `Net/mois : ${Math.round(net)} EUR` : null,
      invest ? `Investissement : ${Math.round(invest)} EUR` : null,
      pbkY && isFinite(pbkY) ? `Retour : ${Number(pbkY).toFixed(1)} ans` : null,
      nb ? `Boxes : ${nb}` : null,
      city ? `Ville : ${city}` : null,
      stage ? `Stade : ${stage}` : null,
      qualification ? `Qualification : ${qualification}` : null
    ].filter(Boolean).join('\n');

    const dealProps = {
      dealname: dealName,
      pipeline: 'default',
      dealstage: '1495240938',
      description
    };

    const deal = await hubspotRequest('POST', '/crm/v3/objects/deals', { properties: dealProps });
    if (deal.status >= 400) return res.status(500).json({ error: 'Deal creation failed', detail: deal.data });

    const dealId = deal.data.id;
    console.log('Deal created:', dealId);

    // 4. Associer le deal au contact
    const assoc = await hubspotRequest('PUT', `/crm/v3/associations/deals/contacts/batch/create`, {
      inputs: [{ from: { id: dealId }, to: { id: contactId }, type: 'deal_to_contact' }]
    });
    console.log('Association:', assoc.status);

    return res.status(200).json({ ok: true, contactId, dealId, enrolled: enrollment.status < 400 });

  } catch (err) {
    console.error('HubSpot error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
