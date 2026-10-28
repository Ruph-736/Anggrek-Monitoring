import {hasSessionCookie,clearCookie} from '../lib/session.js';
export default function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET')return res.status(200).json({authenticated:hasSessionCookie(req.headers.cookie)});
  if(req.method==='DELETE') {res.setHeader('Set-Cookie',clearCookie(req));return res.status(200).json({ok:true});}
  return res.status(405).json({error:'Metode tidak didukung'});
}
