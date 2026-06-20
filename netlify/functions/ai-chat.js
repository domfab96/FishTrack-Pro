// Netlify serverless function — Anthropic API proxy for FishTrack Pro AI Assistant
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured. Set ANTHROPIC_API_KEY in Netlify environment variables.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { messages, system } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'messages array is required' }) };
  }

  // Default system prompt — species-aware, works for any fish type
  const defaultSystem = `You are an expert fish farm management AI assistant for FishTrack Pro, a Nigerian aquaculture SaaS platform.
You help farmers of all fish species — catfish, tilapia, carp, salmon, trout, and others.
Always give species-appropriate advice using the correct FCR benchmarks, feeding rates, and harvest timelines for whatever fish the farmer is raising.
Be concise, practical, and specific. Use the farmer's actual data when provided. Give Nigerian market context where relevant.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: system || defaultSystem,
        messages: messages.slice(-10),
      }),
    });

    const text = await response.text();

    if (!response.ok) {
      let errMsg = 'API error ' + response.status;
      try { errMsg = JSON.parse(text).error?.message || errMsg; } catch(e) {}
      console.error('Anthropic error:', text);
      return { statusCode: response.status, headers, body: JSON.stringify({ error: errMsg }) };
    }

    const data = JSON.parse(text);
    const reply = data.content?.[0]?.text;

    if (!reply) {
      console.error('No reply in response:', JSON.stringify(data));
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'No response generated. Please try again.' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ content: [{ text: reply }] }),
    };

  } catch (err) {
    console.error('Function error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
