import {createHash,timingSafeEqual} from 'node:crypto';
import {database,BASE,DEVICE_ID,monthUTC} from '../lib/firebase.js';
function equal(a,b) {
  const x=createHash('sha256').update(String(a)).digest();
  const y=createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x,y);
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Gunakan POST'});
  const expected=process.env.DEVICE_INGEST_TOKEN;
  const actual=req.headers['x-device-token'];
  if(!expected || !actual || !equal(actual,expected))return res.status(401).json({error:'Token perangkat tidak valid'});
  let body;
  try {body=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body;}
  catch {return res.status(400).json({error:'JSON tidak valid'});}
  const t=Number(body?.temperature_c),h=Number(body?.humidity_percent),ts=Number(body?.ts);
  if(body?.device_id!==DEVICE_ID || !Number.isFinite(t) || t< -45 || t>125 || !Number.isFinite(h) || h<0 || h>100 || !Number.isFinite(ts) || Math.abs(Date.now()-ts)>120000) {
    return res.status(400).json({error:'Data sensor atau timestamp tidak valid'});
  }
  const time=Math.floor(ts/60000)*60000;
  const payload={ts:time,temperature_c:Math.round(t*100)/100,humidity_percent:Math.round(h*100)/100};
  const hour=Math.floor(time/3600000)*3600000;
  try {
    const db=database();const logRef=db.ref(`${BASE}/logs/${monthUTC(time)}/${time}`);
    const result=await logRef.transaction(current=>current===null?payload:undefined,undefined,false);
    // Hanya agregasikan bila menit ini belum pernah tersimpan (mencegah retry duplikat).
    if(result.committed) {
      await db.ref(`${BASE}/hourly/${monthUTC(hour)}/${hour}`).transaction(current=>{
        const n=(current?.count||0)+1;
        const tSum=(current?.t_sum||0)+payload.temperature_c;
        const hSum=(current?.h_sum||0)+payload.humidity_percent;
        return {ts:hour,count:n,t_sum:tSum,h_sum:hSum,temperature_c:Math.round(tSum/n*100)/100,humidity_percent:Math.round(hSum/n*100)/100};
      },undefined,false);
    }
    await db.ref(`${BASE}/latest`).set({...payload,device_id:DEVICE_ID});
    return res.status(200).json({ok:true,saved:result.committed});
  } catch(error) {console.error('[ingest]',error.message);return res.status(503).json({error:'Penyimpanan Firebase belum tersedia'});}
}
