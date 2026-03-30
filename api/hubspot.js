// api/hubspot.js — Vercel serverless function
// Crée un contact + deal dans HubSpot CRM

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    console.error('HUBSPOT_TOKEN manquant');
    return res.status(500).json({ error: 'Config manquante' });
  }

  const {
    firstname, lastname, email, phone,
    city, stage, roi, revM, net, invest,
    pbkY, nb, qualification
  } = req.body || {};

  if (!email || !firstname || !lastname) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  const HS = 'https://api.hubapi.com';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  };

  // ── 1. Créer ou mettre à jour le contact ─────────────────────────────────
  let contactId;
  try {
    // Chercher si le contact existe déjà
    const searchRes = await fetch(`${HS}/crm/v3/objects/contacts/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filterGroups: [{
          filters: [{ propertyName: 'email', operator: 'EQ', value: email }]
        }],
        properties: ['email', 'firstname', 'lastname']
      })
    });
    const searchData = await searchRes.json();

    const contactProps = {
      firstname,
      lastname,
      email,
      phone: phone || '',
      city: city || '',
      // Propriétés custom ROI (à créer dans HubSpot si besoin)
      roi_annuel: roi ? roi.toFixed(1) : '',
      ca_mensuel_simule: revM ? Math.round(revM).toString() : '',
      net_mensuel_simule: net ? Math.round(net).toString() : '',
      investissement_simule: invest ? Math.round(invest).toString() : '',
      retour_invest_annees: pbkY && isFinite(pbkY) ? pbkY.toFixed(1) : '',
      nb_boxes_simule: nb ? nb.toString() : '',
      stade_projet: stage || '',
      qualification_lead: qualification || ''
    };

    if (searchData.total > 0) {
      // Mise à jour contact existant
      contactId = searchData.results[0].id;
      await fetch(`${HS}/crm/v3/objects/contacts/${contactId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ properties: contactProps })
      });
    } else {
      // Création nouveau contact
      const createRes = await fetch(`${HS}/crm/v3/objects/contacts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ properties: contactProps })
      });
      if (!createRes.ok) {
        const err = await createRes.json();
        console.error('Contact create error:', err);
        return res.status(500).json({ error: 'Contact failed' });
      }
      const createData = await createRes.json();
      contactId = createData.id;
    }
  } catch (err) {
    console.error('Contact error:', err);
    return res.status(500).json({ error: 'Contact failed' });
  }

  // ── 2. Créer un deal ──────────────────────────────────────────────────────
  let dealId;
  try {
    const dealName = `[${qualification}] ${firstname} ${lastname} — ${nb} box${nb > 1 ? 'es' : ''} — ROI ${roi ? roi.toFixed(1) : '?'}%`;
    const dealRes = await fetch(`${HS}/crm/v3/objects/deals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        properties: {
          dealname: dealName,
          dealstage: 'appointmentscheduled',
          pipeline: 'default',
          amount: invest ? Math.round(invest).toString() : '0',
          closedate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
      })
    });
    if (dealRes.ok) {
      const dealData = await dealRes.json();
      dealId = dealData.id;

      // Associer le deal au contact
      if (contactId && dealId) {
        await fetch(`${HS}/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`, {
          method: 'PUT',
          headers
        });
      }
    }
  } catch (err) {
    // Le deal est non-bloquant : on ne plante pas si ça échoue
    console.warn('Deal warning:', err);
  }

  return res.status(200).json({ ok: true, contactId, dealId });
}
