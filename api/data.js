// Firebase RTDB dibaca hanya lewat backend Vercel. Semua sumber riwayat = logs asli, BUKAN hourly.
import {requireSession} from '../lib/session.js';
import {database,BASE,monthsInRange} from '../lib/firebase.js';

const DURATIONS={'1h':3600000,'6h':21600000,'24h':86400000,'30d':2592000000};
const HISTORY_SIZE=50;
const EXPORT_SIZE=1000;
const MAX_CHART_POINTS=1800;
const WIB_OFFSET=7*3600000;

function rowsFrom(snap){
  const val=snap.val();
  if(!val||typeof val!=='object')return [];
  return Object.values(val)
    .filter(r=>r&&Number.isFinite(Number(r.ts))&&Number.isFinite(Number(r.temperature_c))&&Number.isFinite(Number(r.humidity_percent)))
    .map(r=>({ts:Number(r.ts),temperature_c:Number(r.temperature_c),humidity_percent:Number(r.humidity_percent),kind:'Log'}));
}
function monthBoundsWIB(month){
  const year=Number(month.slice(0,4)),m=Number(month.slice(4,6))-1;
  return [Date.UTC(year,m,1)-WIB_OFFSET,Date.UTC(year,m+1,1)-WIB_OFFSET];
}
async function readAll(db,from,to){
  const snapshots=await Promise.all(monthsInRange(from,to).map(m=>
    db.ref(`${BASE}/logs/${m}`).orderByChild('ts').startAt(from).endAt(to).get()
  ));
  return snapshots.flatMap(rowsFrom).sort((a,b)=>a.ts-b.ts);
}
// Semua titik yang dikirim ke grafik adalah pengukuran ASLI (tanpa menghitung rata-rata).
// Bila terlalu banyak, tampilkan sebagian titik asli demi performa browser; ekspor tetap lengkap.
function selectChartPoints(rows,maxPoints){
  if(rows.length<=maxPoints)return rows;
  const result=[];
  const step=(rows.length-1)/(maxPoints-1);
  for(let i=0;i<maxPoints;i++)result.push(rows[Math.round(i*step)]);
  return result;
}
async function recentPage(db,from,to,before){
  const end=Math.min(to,before===null?to:before-1);
  if(end<from)return {rows:[],nextCursor:null};
  const months=monthsInRange(from,end).reverse();
  const collected=[];
  for(const m of months){
    const remaining=HISTORY_SIZE+1-collected.length;
    if(remaining<=0)break;
    const snap=await db.ref(`${BASE}/logs/${m}`).orderByChild('ts')
      .startAt(from).endAt(end).limitToLast(remaining).get();
    collected.push(...rowsFrom(snap));
  }
  collected.sort((a,b)=>b.ts-a.ts);
  const hasMore=collected.length>HISTORY_SIZE;
  const rows=collected.slice(0,HISTORY_SIZE);
  return {rows,nextCursor:hasMore?rows[rows.length-1].ts:null};
}
async function exportPage(db,from,to,after){
  const start=Math.max(from,after===null?from:after+1);
  if(start>to)return {rows:[],nextCursor:null};
  const collected=[];
  for(const m of monthsInRange(start,to)){
    const remaining=EXPORT_SIZE+1-collected.length;
    if(remaining<=0)break;
    const snap=await db.ref(`${BASE}/logs/${m}`).orderByChild('ts')
      .startAt(start).endAt(to).limitToFirst(remaining).get();
    collected.push(...rowsFrom(snap));
  }
  collected.sort((a,b)=>a.ts-b.ts);
  const hasMore=collected.length>EXPORT_SIZE;
  const rows=collected.slice(0,EXPORT_SIZE);
  return {rows,nextCursor:hasMore?rows[rows.length-1].ts:null};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Gunakan GET'});
  if(!requireSession(req,res))return;
  const type=String(req.query.type||'latest');
  try{
    const db=database();
    if(type==='latest'){
      const snap=await db.ref(`${BASE}/latest`).get();
      return res.status(200).json({data:snap.val()||null});
    }
    if(type==='month'){
      const month=String(req.query.month||''),part=Number(req.query.part);
      if(!/^(20\d{2})(0[1-9]|1[0-2])$/.test(month)||!Number.isInteger(part)||part<0||part>5)
        return res.status(400).json({error:'Bulan atau bagian tidak valid'});
      // Bulan kalender WIB, bukan UTC; hanya data logs asli.
      const [start,end]=monthBoundsWIB(month);
      const partStart=start+Math.floor((end-start)*part/6);
      const partEnd=start+Math.floor((end-start)*(part+1)/6)-1;
      const rows=await readAll(db,partStart,partEnd);
      return res.status(200).json({rows});
    }
    if(type==='export'){
      const from=Number(req.query.from),to=Number(req.query.to);
      const after=req.query.after===undefined?null:Number(req.query.after);
      if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<=0||to<from||
         to-from>366*86400000||to>Date.now()+60000||
         (after!==null&&(!Number.isSafeInteger(after)||after<from-1||after>to)))
        return res.status(400).json({error:'Rentang waktu ekspor tidak valid'});
      return res.status(200).json(await exportPage(db,from,to,after));
    }
    const period=String(req.query.period||'1h');
    if(!(period in DURATIONS))return res.status(400).json({error:'Periode tidak valid'});
    const to=Date.now(),from=to-DURATIONS[period];
    if(type==='history'){
      const before=req.query.before===undefined?null:Number(req.query.before);
      if(before!==null&&(!Number.isSafeInteger(before)||before<from||before>to))
        return res.status(400).json({error:'Cursor riwayat tidak valid'});
      return res.status(200).json(await recentPage(db,from,to,before));
    }
    if(type==='range'){
      const all=await readAll(db,from,to);
      const rows=period==='30d'?selectChartPoints(all,MAX_CHART_POINTS):all;
      return res.status(200).json({period,rows,rawCount:all.length,sampled:rows.length<all.length});
    }
    return res.status(400).json({error:'Jenis permintaan tidak valid'});
  }catch(error){
    console.error('[data]',error.message);
    return res.status(503).json({error:'Gagal membaca Firebase. Periksa konfigurasi atau log Vercel.'});
  }
}
