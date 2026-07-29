// Netlify SCHEDULED BACKGROUND function — generates the Monthly AI Review for
// every Pro/Enterprise farmer automatically, on a cron schedule (see
// netlify.toml), instead of only firing when a farmer happens to open the app
// in the first few days of the month. The "-background" filename suffix is
// required by Netlify to get the extended (~15 min) execution budget instead
// of the ~10-30s limit on regular functions — this loops over every farmer,
// and each one involves several Firestore round-trips plus an AI-generated
// review, which is too slow for a normal function. Because it's a background
// function, invoking its URL directly returns an immediate 202 with no body —
// check the Netlify Functions logs afterwards to see the run's actual result.
//
// No new SDKs or service-account keys are introduced — this reuses the same
// admin login (ADMIN_EMAIL) that already signs into the in-app Admin Panel,
// authenticating via the Firebase Auth REST API, then talking to Firestore
// directly over its REST API. The existing `/users/{userId}/farm/{doc}`
// security rule already allows read access to any authenticated user
// (allow read: if isAdmin() || request.auth.uid == userId || isAuth()), and
// notifications creation is admin-only — the admin session satisfies both.
//
// Required Netlify environment variable (set this, never commit it):
//   FIREBASE_ADMIN_PASSWORD = the password for the ADMIN_EMAIL Firebase Auth account
//
// Reuses the existing ANTHROPIC_API_KEY indirectly by calling the already
// deployed ai-chat function rather than duplicating the Anthropic call here.

const FIREBASE_API_KEY = 'AIzaSyCImrn14zzGZE8u8ruhYn2dOMiD6sMFz1U'; // public web API key — safe, same one used client-side
const PROJECT_ID = 'doha-farms';
const ADMIN_EMAIL = 'olufemidominic@gmail.com';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AI_CHAT_URL = 'https://fishtrackpro.netlify.app/.netlify/functions/ai-chat';

exports.handler = async () => {
  const adminPassword = process.env.FIREBASE_ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('FIREBASE_ADMIN_PASSWORD not configured');
    return { statusCode: 500, body: 'Missing FIREBASE_ADMIN_PASSWORD environment variable' };
  }

  let idToken;
  try {
    idToken = await signInAsAdmin(adminPassword);
  } catch (e) {
    console.error('Admin sign-in failed:', e);
    return { statusCode: 500, body: 'Admin sign-in failed: ' + e.message };
  }

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
  const monthName = now.toLocaleString('en-NG', { month: 'long' });
  const prevMonthName = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleString('en-NG', { month: 'long' });

  let users;
  try {
    users = await listAllUsers(idToken);
  } catch (e) {
    console.error('List users failed:', e);
    return { statusCode: 500, body: 'Could not list users: ' + e.message };
  }

  let generated = 0, skipped = 0, failed = 0;
  const errors = [];

  for (const user of users) {
    try {
      if (!isProOrEnterpriseActive(user)) { skipped++; continue; }

      const notifId = `monthly-review-${thisMonthKey}`;
      const exists = await docExists(idToken, `users/${user.uid}/notifications/${notifId}`);
      if (exists) { skipped++; continue; }

      const farm = await getFarmData(idToken, user.uid);
      if (!farm) { skipped++; continue; }

      const prompt = buildPrompt(user, farm, monthName, prevMonthName, now);
      const review = await generateReview(prompt);
      if (!review) { failed++; errors.push(user.uid + ': no review text'); continue; }

      await writeNotification(idToken, user.uid, notifId, thisMonthKey, prevMonthName, review);
      generated++;
    } catch (e) {
      console.error('Review failed for', user.uid, e);
      failed++;
      errors.push(user.uid + ': ' + e.message);
    }
  }

  const summary = { generated, skipped, failed, errors: errors.slice(0, 20) };
  console.log('Monthly review cron summary:', JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify(summary) };
};

// ── Firebase Auth (admin sign-in) ──
async function signInAsAdmin(password) {
  const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password, returnSecureToken: true }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || `Sign-in failed (${resp.status})`);
  return data.idToken;
}

// ── Firestore REST helpers ──
async function listAllUsers(idToken) {
  const resp = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }] } }),
  });
  const rows = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(rows));
  return rows
    .filter(r => r.document)
    .map(r => ({ uid: r.document.name.split('/').pop(), ...decodeFields(r.document.fields) }));
}

async function docExists(idToken, path) {
  const resp = await fetch(`${FIRESTORE_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (resp.status === 404) return false;
  if (!resp.ok) throw new Error(`docExists check failed (${resp.status}) for ${path}`);
  return true;
}

async function getFarmData(idToken, uid) {
  const resp = await fetch(`${FIRESTORE_BASE}/users/${uid}/farm/data`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (resp.status === 404) return null;
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return decodeFields(data.fields || {});
}

async function writeNotification(idToken, uid, notifId, monthKey, prevMonthName, review) {
  const resp = await fetch(`${FIRESTORE_BASE}/users/${uid}/notifications/${notifId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      fields: encodeFields({
        type: 'monthly_review',
        title: `📊 ${prevMonthName} Farm Review`,
        message: review,
        sentAt: new Date().toISOString(),
        read: false,
        from: 'ai',
        month: monthKey,
      }),
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
}

// ── Subscription gate — mirrors client-side getSubscriptionStatus() ──
function isProOrEnterpriseActive(user) {
  const plan = user.plan;
  if (plan !== 'pro' && plan !== 'enterprise') return false;
  if (user.subscriptionStatus !== 'active') return false;
  if (user.subscriptionExpiry) {
    const expTime = new Date(user.subscriptionExpiry).getTime();
    if (!(expTime > Date.now())) return false; // expired
  }
  return true;
}

// ── Build the same style of prompt as the client-side monthly review ──
function buildPrompt(user, farm, monthName, prevMonthName, now) {
  const ponds = Object.entries(farm.ponds || {}).map(([id, p]) => ({ id, ...p }));
  const batches = farm.batches || {};
  const dailyLogs = farm.dailyLogs || {};
  const cur = (farm.settings && farm.settings.currency) || '₦';
  const fmt = n => Math.round(n || 0).toLocaleString();

  const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString().slice(0, 10);

  let totalFed30 = 0, totalDeaths30 = 0, activePonds = 0;
  const pondLines = ponds.map(pond => {
    const batch = batches[pond.id];
    const logs = (dailyLogs[pond.id] || []).filter(l => l.date >= thirtyDaysAgo);
    const fed = logs.reduce((s, l) => s + (l.feed || 0), 0);
    const deaths = logs.reduce((s, l) => s + (l.mort || 0), 0);
    totalFed30 += fed; totalDeaths30 += deaths;
    if (batch) activePonds++;
    if (!batch) return `- ${pond.name}: No active batch`;
    const alive = (batch.count || 0) - (batch.mortality || 0);
    const weights = (dailyLogs[pond.id] || []).filter(l => l.sampleWeight).slice(-3);
    const avgW = weights.length ? Math.round(weights.reduce((s, l) => s + l.sampleWeight, 0) / weights.length) : 0;
    const stocked = batch.stockedAt ? new Date(batch.stockedAt) : null;
    const weeks = stocked ? Math.floor((now - stocked) / 604800000) : 0;
    return `- ${pond.name}: ${alive} fish alive, week ${weeks}, ${fed}kg fed, ${deaths} deaths, avg weight ${avgW}g`;
  }).join('\n');

  const expenses = (farm.expenses || []).filter(e => e.date >= thirtyDaysAgo);
  const totalExpenses30 = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const sales = (farm.sales || []).filter(s => s.date >= thirtyDaysAgo);
  const totalRevenue30 = sales.reduce((s, x) => s + (parseFloat(x.total || x.totalPrice) || 0), 0);
  const harvests30 = (farm.harvests || []).filter(h => h.date >= thirtyDaysAgo);
  const profit30 = totalRevenue30 - totalExpenses30;
  const species = [...new Set(ponds.map(p => p.fishType || 'catfish'))].join(', ');

  return `You are writing a monthly farm performance review for a Nigerian catfish farmer using FishTrack Pro.

FARMER: ${user.name || 'Farmer'}
FARM: ${(farm.settings && farm.settings.farmName) || 'Farm'}
REVIEW MONTH: ${prevMonthName} ${now.getFullYear()}
PLAN: ${user.plan}
FISH SPECIES: ${species}

LAST 30 DAYS DATA:
- Active ponds: ${activePonds} of ${ponds.length} total
- Total feed used: ${totalFed30}kg
- Total deaths recorded: ${totalDeaths30}
- Revenue: ${cur}${fmt(totalRevenue30)}
- Expenses: ${cur}${fmt(totalExpenses30)}
- Profit/Loss: ${cur}${fmt(profit30)} (${profit30 >= 0 ? 'PROFIT' : 'LOSS'})
- Harvests completed: ${harvests30.length}

POND DETAILS:
${pondLines}

Write a warm, professional monthly review with these sections:
1. Opening (2 sentences — greet the farmer by first name, summarise the month in one line)
2. What Went Well (2–3 specific positives from the data)
3. Areas to Improve (2–3 specific issues with actionable fixes)
4. Key Numbers (a brief summary of the most important metrics)
5. Recommendations for ${monthName} (3 clear, numbered action items for the coming month)
6. Closing encouragement (1–2 sentences)

Write in plain paragraphs — no markdown headers, no bullet symbols. Use the farmer's actual numbers throughout. Keep it under 400 words. Warm but professional tone.`;
}

async function generateReview(prompt) {
  const resp = await fetch(AI_CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: 'You are an expert aquaculture advisor writing monthly farm performance reviews for Nigerian fish farmers. Be specific, data-driven, and encouraging. Use species-appropriate benchmarks (FCR, feeding rates, harvest timelines) based on the fish type specified.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error('ai-chat error ' + resp.status);
  const data = await resp.json();
  return data.content && data.content[0] && data.content[0].text;
}

// ── Firestore REST <-> plain-object value codec ──
function decodeValue(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  return null;
}
function decodeFields(fields) {
  const out = {};
  Object.entries(fields || {}).forEach(([k, v]) => { out[k] = decodeValue(v); });
  return out;
}
function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v) } };
  return { stringValue: String(v) };
}
function encodeFields(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => { out[k] = encodeValue(v); });
  return out;
}
