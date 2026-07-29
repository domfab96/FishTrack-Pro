// Netlify serverless function — creates a one-off Paystack payment link.
// Used by the Marketplace feature to invoice farmers for the platform
// commission owed after they mark a harvest listing "sold". Reuses the same
// live Paystack account as subscription billing, but as a standalone charge
// (no subaccounts/split payments) — so only the SECRET key is needed here,
// set as PAYSTACK_SECRET_KEY in Netlify environment variables. Never expose
// the secret key in the frontend — only this server-side function touches it.
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Paystack secret key not configured. Set PAYSTACK_SECRET_KEY in Netlify environment variables.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { email, amountNaira, reference, metadata } = body;
  if (!email || !amountNaira || amountNaira <= 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'email and a positive amountNaira are required' }) };
  }

  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify({
        email,
        amount: Math.round(amountNaira * 100), // Paystack expects kobo
        reference: reference || undefined,
        metadata: metadata || {},
      }),
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = null; }

    if (!response.ok || !data || !data.status) {
      const errMsg = (data && data.message) || `Paystack error ${response.status}`;
      console.error('Paystack initialize error:', text);
      return { statusCode: response.status || 500, headers, body: JSON.stringify({ error: errMsg }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        authorization_url: data.data.authorization_url,
        access_code: data.data.access_code,
        reference: data.data.reference,
      }),
    };
  } catch (err) {
    console.error('Function error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
