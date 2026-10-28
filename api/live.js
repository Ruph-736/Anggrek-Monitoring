// WebSocket sesudah login sandi Vercel; backend yang konek MQTT TLS.
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {WebSocket,WebSocketServer} from 'ws';
import mqtt from 'mqtt';
import {hasSessionCookie} from '../lib/session.js';

export const maxDuration=300;
const TOPIC='anggrek/anggrek_01/live';
const SERVER=createServer((_req,res)=>{res.writeHead(426,{'Content-Type':'text/plain'});res.end('WebSocket diperlukan');});
const WSS=new WebSocketServer({server:SERVER,maxPayload:4096,perMessageDeflate:false});
WSS.on('connection',(ws,req)=>{
  const send=obj=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));};
  let host=req.headers['x-forwarded-host']||req.headers.host||'';
  let validOrigin=false;
  try {validOrigin=new URL(req.headers.origin).host===host;}catch{}
  if(!validOrigin || !hasSessionCookie(req.headers.cookie)) {
    send({type:'error',fatal:true,message:'Sesi website tidak valid'});ws.close(1008,'Unauthorized');return;
  }
  const {EMQX_HOST,EMQX_USERNAME,EMQX_PASSWORD}=process.env;
  if(!EMQX_HOST||!/^[a-z0-9.-]+$/i.test(EMQX_HOST)||!EMQX_USERNAME||!EMQX_PASSWORD) {
    send({type:'error',fatal:true,message:'Konfigurasi EMQX Vercel belum lengkap'});ws.close(1011,'Config');return;
  }
  let connected=false;
  const client=mqtt.connect({protocol:'mqtts',host:EMQX_HOST,port:8883,username:EMQX_USERNAME,password:EMQX_PASSWORD,clientId:'anggrek-web-'+randomBytes(8).toString('hex'),clean:true,protocolVersion:4,reconnectPeriod:5000,connectTimeout:15000,rejectUnauthorized:true});
  const timer=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.ping();},30000);
  const cleanup=()=>{clearInterval(timer);client.end(true);};
  ws.on('close',cleanup);ws.on('error',cleanup);
  client.on('connect',()=>client.subscribe(TOPIC,{qos:0},(err,granted)=>{
    connected=!err && !!granted?.some(g=>g.topic===TOPIC && g.qos!==128);
    send({type:'status',connected,detail:connected?'EMQX LIVE':'Subscribe ditolak. Periksa akun EMQX.'});
  }));
  client.on('close',()=>{connected=false;send({type:'status',connected:false,detail:'EMQX terputus. Menghubungkan ulang...'});});
  client.on('error',err=>{connected=false;send({type:'status',connected:false,detail:'EMQX: '+err.message});});
  client.on('message',(topic,bytes)=>{
    if(!connected||topic!==TOPIC||bytes.length>4096)return;
    try {
      const data=JSON.parse(bytes.toString('utf8'));
      const t=Number(data.temperature_c),h=Number(data.humidity_percent),ts=Number(data.ts);
      if(data.device_id!=='anggrek_01'||!Number.isFinite(ts)||!Number.isFinite(t)||!Number.isFinite(h)||h<0||h>100)return;
      send({type:'reading',data:{ts,device_id:'anggrek_01',temperature_c:t,humidity_percent:h}});
    }catch{}
  });
  send({type:'status',connected:false,detail:'Menyambung EMQX...'});
});
export default SERVER;
