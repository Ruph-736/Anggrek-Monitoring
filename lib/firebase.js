import {initializeApp,getApps,cert} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';
export function database() {
  const credentials=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const databaseURL=process.env.FIREBASE_DATABASE_URL;
  if (!credentials||!databaseURL) throw new Error('Konfigurasi Firebase di Vercel belum lengkap');
  if (!getApps().length) initializeApp({credential:cert(JSON.parse(credentials)),databaseURL});
  return getDatabase();
}
export const DEVICE_ID = 'anggrek_01';
export const BASE=`devices/${DEVICE_ID}`;
export function monthUTC(timestamp) {
  const d=new Date(timestamp);return d.getUTCFullYear()+String(d.getUTCMonth()+1).padStart(2,'0');
}
export function monthsInRange(from,to) {
  const out=[];const d=new Date(from);d.setUTCDate(1);d.setUTCHours(0,0,0,0);
  const end=new Date(to);end.setUTCDate(1);end.setUTCHours(0,0,0,0);
  for(;d<=end&&out.length<18;d.setUTCMonth(d.getUTCMonth()+1)) out.push(monthUTC(d.getTime()));
  return out;
}
