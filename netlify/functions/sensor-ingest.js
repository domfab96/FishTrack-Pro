/**
 * FishTrackPro — IoT Sensor Ingest Function
 * ==========================================
 * Receives HTTP POST requests from ESP32 hardware devices
 * and writes sensor readings to Firestore under the correct
 * farmer's pond path.
 *
 * Deployed at: /.netlify/functions/sensor-ingest
 * Called by:   ESP32 microcontroller via GSM/SIM800L HTTP POST
 *
 * Expected POST body (JSON):
 * {
 *   "deviceId":  "DPV-IOT-001",   — unique device identifier
 *   "apiKey":    "your-secret",   — shared secret for auth
 *   "pondId":    "pond_abc123",   — Firestore pond document ID
 *   "ownerId":   "firebase_uid",  — farm owner's Firebase Auth UID
 *   "temp":      27.4,            — water temperature °C
 *   "do":        7.2,             — dissolved oxygen mg/L
 *   "ph":        7.1,             — pH level
 *   "feed":      true,            — was feed detected? (bool)
 *   "level":     85               — water level % (optional)
 * }
 *
 * Firestore write path:
 *   users/{ownerId}/sensorReadings/{pondId}
 *
 * Environment variables required (set in Netlify dashboard):
 *   SENSOR_API_KEY      — shared secret between Netlify and all ESP32 devices
 *   FIREBASE_PROJECT_ID — your Firebase project ID (doha-farms)
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 */

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore }                  = require('firebase-admin/firestore');

// Initialise Firebase Admin (runs once per cold start)
function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

exports.handler = async (event) => {
  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { deviceId, apiKey, pondId, ownerId, temp, do: dissolvedOxygen, ph, feed, level } = body;

  // ── Authentication ────────────────────────────────────────────────────────
  if (apiKey !== process.env.SENSOR_API_KEY) {
    console.warn(`[sensor-ingest] Invalid API key from device: ${deviceId}`);
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // ── Validation ────────────────────────────────────────────────────────────
  if (!deviceId || !pondId || !ownerId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields: deviceId, pondId, ownerId' })
    };
  }

  // ── Build the sensor reading document ────────────────────────────────────
  const reading = {
    deviceId,
    pondId,
    recordedAt: new Date().toISOString(),
    source:     'hardware',
  };

  // Only include sensor values that were actually provided
  if (temp         !== undefined) reading.temp  = parseFloat(temp);
  if (dissolvedOxygen !== undefined) reading.do = parseFloat(dissolvedOxygen);
  if (ph           !== undefined) reading.ph    = parseFloat(ph);
  if (feed         !== undefined) reading.feed  = Boolean(feed);
  if (level        !== undefined) reading.level = parseFloat(level);

  // ── Write to Firestore ────────────────────────────────────────────────────
  try {
    const db = getDb();

    // Latest reading (overwrites previous) — for live dashboard display
    await db.collection('users').doc(ownerId)
      .collection('sensorReadings').doc(pondId)
      .set(reading);

    // Historical reading (appended) — for charts and trend analysis
    await db.collection('users').doc(ownerId)
      .collection('sensorHistory').doc(pondId)
      .collection('readings').add(reading);

    console.log(`[sensor-ingest] ✓ ${deviceId} → pond ${pondId} for owner ${ownerId}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        deviceId,
        pondId,
        timestamp: reading.recordedAt,
        message: 'Sensor reading recorded successfully'
      }),
    };

  } catch (err) {
    console.error('[sensor-ingest] Firestore write error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to write to database', detail: err.message })
    };
  }
};
