// BARU: Verifikasi password di server Vercel; jangan simpan secret di GitHub.
import { createHash, timingSafeEqual } from 'node:crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak diizinkan.' });
  const secret = process.env.DASHBOARD_PASSWORD;
  const uid = process.env.FIREBASE_OWNER_UID;
  const credentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!secret || !uid || !credentials) return res.status(503).json({ error: 'Konfigurasi Vercel belum lengkap.' });
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch { return res.status(400).json({error:'Data tidak valid.'}); }
  const candidate = body?.password;
  if (typeof candidate !== 'string' || candidate.length > 256) return res.status(400).json({ error: 'Password tidak valid.' });
  const hash = value => createHash('sha256').update(value, 'utf8').digest();
  if (!timingSafeEqual(hash(candidate), hash(secret))) return res.status(401).json({ error: 'Password website salah.' });
  try {
    if (!getApps().length) initializeApp({ credential: cert(JSON.parse(credentials)) });
    const token = await getAuth().createCustomToken(uid);
    return res.status(200).json({ token });
  } catch (error) {
    console.error('[login] Gagal membuat token:', error.code || error.message);
    return res.status(500).json({ error: 'Login server gagal. Periksa kredensial Firebase Admin di Vercel.' });
  }
}
