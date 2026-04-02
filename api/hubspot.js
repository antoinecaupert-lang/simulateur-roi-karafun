module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (process.env.HUBSPOT_TOKEN || '').trim();
  if (!token) return res.status(500).json({ error: 'Config manquante' });

  const { firstname, lastname, email, phone, city, country, stage, roi, revM, net, invest, pbkY, nb } = req.body || {};
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

    // Routing : US/CA → USA Pipeline (Justin), autres → Main Pipeline (Eliott/Antoine)
    const isUSA = ['US', 'CA'].includes((country || '').toUpperCase());
    const isEliott = !isUSA && nb && Number(nb) < 5;

    // 2. Enroller le contact dans la séquence (FR uniquement)
    let enrollment = { status: 0 };
    if (!isUSA) {
      const seqUserId = isEliott ? 30315142 : 67082377;
      const seqSender = isEliott ? 'eliott@recisio.com' : 'antoine.caupert@recisio.com';
      enrollment = await hubspotRequest('POST', `/automation/v4/sequences/enrollments?userId=${seqUserId}`, {
        sequenceId: 796519659,
        contactId: contactId,
        senderEmail: seqSender
      });
      console.log('Sequence enrollment:', enrollment.status, JSON.stringify(enrollment.data));
    }

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
      stage ? `Stade : ${stage}` : null
    ].filter(Boolean).join('\n');

    const dealProps = {
      dealname: dealName,
      pipeline: isUSA ? '1553664195' : 'default',
      dealstage: isUSA ? '2123380974' : '1495240938',
      amount: nb ? String(Number(nb) * 199 * 12) : undefined,
      hubspot_owner_id: isUSA ? '33005911' : (isEliott ? '30315142' : '67082377'),
      origine_deal: 'Simulateur ROI',
      description,
      roi_annuel: roi ? Number(Number(roi).toFixed(1)) : undefined,
      ca_mensuel_simule: revM ? Math.round(revM) : undefined,
      net_mensuel_simule: net ? Math.round(net) : undefined,
      investissement_simule: invest ? Math.round(invest) : undefined,
      retour_sur_investissement_ans: pbkY && isFinite(pbkY) ? Number(Number(pbkY).toFixed(1)) : undefined,
      nombre_de_boxes_simule: nb ? Number(nb) : undefined,
      stade_du_projet: stage || undefined
    };

    const deal = await hubspotRequest('POST', '/crm/v3/objects/deals', { properties: dealProps });
    if (deal.status >= 400) return res.status(500).json({ error: 'Deal creation failed', detail: deal.data });

    const dealId = deal.data.id;
    console.log('Deal created:', dealId);

    // 4. Associer le deal au contact
    const assoc = await hubspotRequest('POST', `/crm/v3/associations/deals/contacts/batch/create`, {
      inputs: [{ from: { id: dealId }, to: { id: contactId }, type: 'deal_to_contact' }]
    });
    console.log('Association:', assoc.status);

    // 5. Créer le line item (abonnement KaraFun Business 12 mois)
    let lineItemId = null;
    if (nb) {
      const lineItem = await hubspotRequest('POST', '/crm/v3/objects/line_items', {
        properties: {
          hs_product_id: '88115536119',
          name: 'Abonnement KaraFun Business 12 mois',
          quantity: String(Number(nb)),
          price: '199',
          recurringbillingfrequency: 'monthly',
          hs_term_in_months: '12'
        }
      });
      if (lineItem.status < 400) {
        lineItemId = lineItem.data.id;
        await hubspotRequest('POST', '/crm/v3/associations/deals/line_items/batch/create', {
          inputs: [{ from: { id: dealId }, to: { id: lineItemId }, type: 'deal_to_line_item' }]
        });
        console.log('Line item created and associated:', lineItemId);
      } else {
        console.warn('Line item creation failed:', lineItem.status, JSON.stringify(lineItem.data));
      }
    }

    return res.status(200).json({ ok: true, contactId, dealId, lineItemId, enrolled: enrollment.status < 400 });

  } catch (err) {
    console.error('HubSpot error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
