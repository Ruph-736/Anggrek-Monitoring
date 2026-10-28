import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const COOKIE = 'anggreksense_session';
const TTL = 12 * 60 * 60 * 1000;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET harus minimal 32 karakter acak');
  return value;
}
function sign(body) { return createHmac('sha256', secret()).update(body).digest('base64url'); }
function equals(a,b) {
  const x=createHash('sha256').update(String(a)).digest();
  const y=createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x,y);
}
function parseCookies(value='') {
  return Object.fromEntries(value.split(';').map(pair=>{
    const i=pair.indexOf('='); return i<0?['','']:[pair.slice(0,i).trim(),pair.slice(i+1).trim()];
  }));
}
export function validPassword(candidate) {
  return typeof candidate==='string' && candidate.length<=256 &&
    !!process.env.DASHBOARD_PASSWORD && equals(candidate,process.env.DASHBOARD_PASSWORD);
}
export function createCookie(req) {
  const payload=Buffer.from(JSON.stringify({exp:Date.now()+TTL,scope:'dashboard'})).toString('base64url');
  const value=payload+'.'+sign(payload);
  const secure=(req.headers['x-forwarded-proto']||'https')==='https'?' Secure;':'';
  return `${COOKIE}=${value}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${TTL/1000}`;
}
export function clearCookie(req) {
  const secure=(req.headers['x-forwarded-proto']||'https')==='https'?' Secure;':'';
  return `${COOKIE}=; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=0`;
}
export function hasSessionCookie(cookieHeader) {
  try {
    const token=parseCookies(cookieHeader)[COOKIE];
    if (!token) return false;
    const parts=token.split('.'); if (parts.length!==2) return false;
    if (!equals(parts[1],sign(parts[0]))) return false;
    const value=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
    return value.scope==='dashboard' && Number.isFinite(value.exp) && value.exp>Date.now();
  } catch {return false;}
}
export function requireSession(req,res) {
  if (hasSessionCookie(req.headers.cookie))return true;
  res.status(401).json({error:'Sesi habis. Masuk menggunakan sandi website.'});
  return false;
}
