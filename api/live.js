// BARU: jembatan MQTT privat pada Vercel Functions WebSocket.
// Browser hanya menerima data sensor; kredensial EMQX tidak pernah dikirim.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import mqtt from 'mqtt';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export const maxDuration = 300;
const TOPIC = 'anggrek/anggrek_01/live';
const DEVICE_ID = 'anggrek_01';

function adminAuth() {
  if (!getApps().length) {
    const credentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!credentials) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON belum disetel');
    initializeApp({ credential: cert(JSON.parse(credentials)) });
  }
  return getAuth();
}

const server = createServer((_request, response) => {
  response.writeHead(426, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
  response.end('Endpoint ini memerlukan WebSocket.');
});

const wss = new WebSocketServer({ server, maxPayload: 4096, perMessageDeflate: false });

wss.on('connection', (ws, request) => {
  // Hanya koneksi dari website sendiri; data tetap wajib diautentikasi.
  const origin = request.headers.origin;
  const host = request.headers['x-forwarded-host'] || request.headers.host;
  try {
    if (!origin || new URL(origin).host !== host) {
      ws.close(1008, 'Origin tidak valid');
      return;
    }
  } catch {
    ws.close(1008, 'Origin tidak valid');
    return;
  }

  let authorized = false;
  let checking = false;
  let broker = null;
  let subscribed = false;
  const send = message => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };
  const status = (connected, detail) => send({ type:'status', connected, detail });
  const fatal = message => {
    send({ type:'error', fatal:true, message });
    ws.close(1008, 'Akses ditolak');
  };
  const closeBroker = () => {
    subscribed = false;
    if (broker) {
      const old = broker;
      broker = null;
      old.end(true);
    }
  };

  const deadline = setTimeout(() => fatal('Batas waktu autentikasi habis.'), 10000);
  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, 30000);

  const shutdown = () => {
    clearTimeout(deadline);
    clearInterval(heartbeat);
    closeBroker();
  };
  ws.on('close', shutdown);
  ws.on('error', shutdown);

  ws.on('message', async raw => {
    if (authorized || checking) return;
    checking = true;
    let data;
    try { data = JSON.parse(raw.toString()); } catch { fatal('Permintaan autentikasi tidak valid.'); return; }
    if (data?.type !== 'auth' || typeof data.token !== 'string' || data.token.length > 8192) {
      fatal('Token login tidak valid.');
      return;
    }

    const { EMQX_HOST, EMQX_VIEWER_USERNAME, EMQX_VIEWER_PASSWORD, FIREBASE_OWNER_UID } = process.env;
    if (![EMQX_HOST, EMQX_VIEWER_USERNAME, EMQX_VIEWER_PASSWORD, FIREBASE_OWNER_UID,
           process.env.FIREBASE_SERVICE_ACCOUNT_JSON].every(Boolean)) {
      fatal('Konfigurasi server Vercel belum lengkap. Periksa Environment Variables.');
      return;
    }
    if (!/^[a-z0-9.-]+$/i.test(EMQX_HOST)) {
      fatal('EMQX_HOST harus berupa nama host tanpa protokol dan port.');
      return;
    }

    try {
      // Verify Firebase ID token di server, termasuk pemeriksaan revocation.
      const identity = await adminAuth().verifyIdToken(data.token, true);
      if (identity.uid !== FIREBASE_OWNER_UID) {
        fatal('Akun tidak diizinkan mengakses monitoring.');
        return;
      }
    } catch (error) {
      console.error('[live] Firebase authentication gagal:', error.code || error.message);
      fatal('Sesi login tidak valid. Silakan login kembali.');
      return;
    }

    if (ws.readyState !== WebSocket.OPEN) return;
    authorized = true;
    clearTimeout(deadline);
    status(false, 'Login terverifikasi. Menghubungkan ke EMQX Cloud...');

    try {
      // MQTT TLS, tanpa mengirim password ke website.
      broker = mqtt.connect({
        protocol: 'mqtts',
        host: EMQX_HOST,
        port: 8883,
        username: EMQX_VIEWER_USERNAME,
        password: EMQX_VIEWER_PASSWORD,
        clientId: 'anggrek-view-' + randomBytes(8).toString('hex'),
        clean: true,
        protocolVersion: 4,
        rejectUnauthorized: true,
        reconnectPeriod: 4000,
        connectTimeout: 15000,
        keepalive: 30
      });

      broker.on('connect', () => {
        subscribed = false;
        broker.subscribe(TOPIC, { qos: 0 }, (error, granted) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const accepted = !error && Array.isArray(granted) &&
            granted.some(item => item.topic === TOPIC && item.qos !== 128);
          subscribed = accepted;
          if (accepted) status(true, 'LIVE • EMQX MQTT terhubung melalui Vercel');
          else status(false, 'EMQX terhubung, tetapi Subscribe ditolak. Periksa ACL akun viewer.');
        });
      });
      broker.on('reconnect', () => status(false, 'EMQX terputus. Mencoba menyambung ulang...'));
      broker.on('close', () => {
        subscribed = false;
        status(false, 'Koneksi MQTT broker terputus.');
      });
      broker.on('error', error => {
        console.error('[live] MQTT:', error.message);
        status(false, 'MQTT gagal: ' + error.message);
      });
      broker.on('message', (topic, payload) => {
        if (!subscribed || topic !== TOPIC || payload.length > 4096) return;
        try {
          const reading = JSON.parse(payload.toString('utf8'));
          if (!reading || reading.device_id !== DEVICE_ID ||
              !Number.isFinite(Number(reading.ts)) ||
              !Number.isFinite(Number(reading.temperature_c)) ||
              !Number.isFinite(Number(reading.humidity_percent))) return;
          // Hanya teruskan data sensor yang diharapkan, bukan payload sembarang.
          send({ type:'reading', data: {
            device_id: DEVICE_ID,
            ts: Number(reading.ts),
            temperature_c: Number(reading.temperature_c),
            humidity_percent: Number(reading.humidity_percent)
          }});
        } catch { /* Payload diabaikan jika bukan JSON valid. */ }
      });
    } catch (error) {
      console.error('[live] Gagal membuat koneksi MQTT:', error.message);
      fatal('Backend MQTT gagal dimulai. Periksa Vercel Logs.');
    }
  });
});

// Vercel Functions WebSocket: ekspor HTTP server (jangan panggil listen()).
export default server;
