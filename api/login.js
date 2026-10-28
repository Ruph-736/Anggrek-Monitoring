import {validPassword,createCookie} from '../lib/session.js';
export default function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Metode tidak didukung'});
  if(!process.env.DASHBOARD_PASSWORD||!process.env.SESSION_SECRET)return res.status(503).json({error:'Variabel login Vercel belum lengkap'});
  let body=req.body;
  try{if(typeof body==='string')body=JSON.parse(body);}catch{return res.status(400).json({error:'Format data tidak valid'});}
  const password=body?.password;
  if(!validPassword(password))return res.status(401).json({error:'Sandi website salah'});
  try {res.setHeader('Set-Cookie',createCookie(req));return res.status(200).json({ok:true});}
  catch {return res.status(503).json({error:'SESSION_SECRET belum benar'});}
}
