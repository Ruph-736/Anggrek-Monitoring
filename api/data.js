import {requireSession} from '../lib/session.js';
import {database,BASE,monthUTC,monthsInRange} from '../lib/firebase.js';
const DURATIONS={ '1h':3600000,'6h':21600000,'24h':86400000,'30d':2592000000 };
function rowsFrom(snap,kind) {
  const v=snap.val();if(!v || typeof v!=='object') return [];
  return Object.values(v).filter(r=>r&&Number.isFinite(Number(r.ts))&&Number.isFinite(Number(r.temperature_c))&&Number.isFinite(Number(r.humidity_percent)))
    .map(r=>({ts:Number(r.ts),temperature_c:Number(r.temperature_c),humidity_percent:Number(r.humidity_percent),count:Number(r.count)||undefined,kind:kind||'Log'}));
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Gunakan GET'});
  if(!requireSession(req,res))return;
  const type=String(req.query.type||'latest');
  try {
    const db=database();
    if(type==='latest') {
      const snap=await db.ref(`${BASE}/latest`).get();return res.status(200).json({data:snap.val()||null});
    }
    if(type==='month') {
      const month=String(req.query.month||'');
      const part=Number(req.query.part);
      if(!/^(20\d{2})(0[1-9]|1[0-2])$/.test(month)||!Number.isInteger(part)||part<0||part>5)return res.status(400).json({error:'Bulan atau bagian tidak valid'});
      const y=Number(month.slice(0,4)),m=Number(month.slice(4,6))-1;
      const start=Date.UTC(y,m,1),end=Date.UTC(y,m+1,1);
      // Enam bagian, supaya arsip sebulan tidak melebihi batas respons Vercel 4.5 MB.
      const partStart=start+Math.floor((end-start)*part/6);
      const partEnd=start+Math.floor((end-start)*(part+1)/6)-1;
      const [raw,hourly]=await Promise.all(['logs','hourly'].map(k=>db.ref(`${BASE}/${k}/${month}`).orderByChild('ts').startAt(partStart).endAt(partEnd).get()));
      return res.status(200).json({rows:[...rowsFrom(raw,'Log'),...rowsFrom(hourly,'Rata-rata/jam')].sort((a,b)=>a.ts-b.ts)});
    }
    if(type!=='range')return res.status(400).json({error:'Jenis permintaan tidak valid'});
    const period=String(req.query.period||'1h');
    if(!(period in DURATIONS))return res.status(400).json({error:'Periode tidak valid'});
    const end=Date.now(), start=end-DURATIONS[period],bucket=period==='30d'?'hourly':'logs';
    const months=monthsInRange(start,end);
    const snapshots=await Promise.all(months.map(m=>db.ref(`${BASE}/${bucket}/${m}`).orderByChild('ts').startAt(start).endAt(end).get()));
    const rows=snapshots.flatMap(s=>rowsFrom(s,bucket==='hourly'?'Rata-rata/jam':'Log')).sort((a,b)=>a.ts-b.ts);
    return res.status(200).json({period,rows});
  }catch(error){console.error('[data]',error.message);return res.status(503).json({error:'Firebase belum tersedia. Periksa konfigurasi server.'});}
}
