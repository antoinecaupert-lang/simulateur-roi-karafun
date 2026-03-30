// api/hubspot.js — Vercel Edge Function
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

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: 'Config manquante' }), { status: 500, headers: corsHeaders });
  }

  const body = await request.json();
  const { firstname, lastname, email, phone, city, stage, roi, revM, net, invest, pbkY, nb, qualification } = body;

  if (!email || !firstname || !lastname) {
    return new Response(JSON.stringify({ error: 'Champs requis manquants' }), { status: 400, headers: corsHeaders });
  }

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        properties: { firstname, lastname, email, phone: phone || '', city: city || '', message: roiSummary }
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await response.json();
    console.log('HubSpot status:', response.status, JSON.stringify(data));

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Contact failed', detail: data }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true, contactId: data.id }), { status: 200, headers: corsHeaders });

  } catch (err) {
    console.error('HubSpot error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
