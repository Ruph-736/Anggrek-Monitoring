// AnggrekSense: login cookie Vercel; Firebase dibaca lewat backend saja.
import { DEVICE_ID } from './config.js';
const $=id=>document.getElementById(id);
const WIB=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const SHORT=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const PERIODS={'1h':3600000,'6h':21600000,'24h':86400000,'30d':2592000000,live:900000};
const state={loggedIn:false,page:'dashboard',dashboardPeriod:'live',historyPeriod:'24h',historyLogPeriod:'24h',latest:null,mqttLast:null,mqttOnline:false,firebaseOnline:false,liveRows:[],dashboardRows:[],historyRows:[],historyPage:0,chartDashboard:null,chartHistory:null,liveSocket:null,liveReconnect:null,wantLive:false,liveGeneration:0,liveRetry:0};
const PER_PAGE=50;
const tformat=(ts,short=false)=>Number.isFinite(Number(ts))&&Number(ts)>0?(short?SHORT:WIB).format(Number(ts)):'—';
const num=v=>Number.isFinite(Number(v))?Number(v).toFixed(2):'--';
function note(message,bad=false){$('notice').textContent=message;$('notice').classList.toggle('error',bad);$('notice').classList.remove('hidden');}
async function api(url,options={}){
  const res=await fetch(url,{cache:'no-store',credentials:'same-origin',...options});
  let body;try{body=await res.json();}catch{throw new Error('Respons server bukan JSON');}
  if(!res.ok)throw new Error(body.error||`HTTP ${res.status}`);
  return body;
}
function isReading(d){return !!d&&Number.isFinite(Number(d.ts))&&Number.isFinite(Number(d.temperature_c))&&Number.isFinite(Number(d.humidity_percent));}
function readRow(r,kind){return{...r,ts:Number(r.ts),temperature_c:Number(r.temperature_c),humidity_percent:Number(r.humidity_percent),kind};}
function recentRange(period){return [Date.now()-PERIODS[period],Date.now()];}
function createChart(canvas){
  if(!window.Chart)throw new Error('Library Chart.js tidak termuat');
  return new Chart(canvas.getContext('2d'),{type:'line',data:{datasets:[
    {label:'Suhu (°C)',data:[],borderColor:'#f49c5c',backgroundColor:'rgba(244,156,92,.08)',pointRadius:0,pointHoverRadius:4,borderWidth:2.4,tension:.22,spanGaps:false,yAxisID:'t'},
    {label:'Kelembapan (%RH)',data:[],borderColor:'#208de1',backgroundColor:'rgba(32,141,225,.08)',pointRadius:0,pointHoverRadius:4,borderWidth:2.4,tension:.22,spanGaps:false,yAxisID:'h'}]},
    options:{responsive:true,maintainAspectRatio:false,animation:false,normalized:true,interaction:{mode:'nearest',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{title:a=>a.length?tformat(a[0].parsed.x):''}}},
      scales:{x:{type:'linear',ticks:{color:'#91a0b4',maxTicksLimit:6,callback:v=>tformat(v,true),font:{size:10}},grid:{color:'#eef2f7'},border:{display:false}},
        t:{type:'linear',position:'left',ticks:{color:'#b18d75',font:{size:10}},grid:{color:'#eef2f7'},border:{display:false},title:{display:true,text:'Suhu (°C)',color:'#c39475'}},
        h:{type:'linear',position:'right',min:0,max:100,ticks:{color:'#659ac3',font:{size:10}},grid:{drawOnChartArea:false},border:{display:false},title:{display:true,text:'Kelembapan (%)',color:'#659ac3'}}}}
  });
}
function chartPoints(rows,key,period){
  const gap=period==='live'?5000:period==='30d'?3600000:60000;
  const out=[];
  rows.forEach((r,i)=>{if(i&&r.ts-rows[i-1].ts>gap*2.8)out.push({x:Math.round((r.ts+rows[i-1].ts)/2),y:null});out.push({x:r.ts,y:r[key]});});
  return out;
}
function draw(chart,rows,period){
  if(!chart)return;
  chart.data.datasets[0].data=chartPoints(rows,'temperature_c',period);
  chart.data.datasets[1].data=chartPoints(rows,'humidity_percent',period);
  const [min,max]=recentRange(period);chart.options.scales.x.min=min;chart.options.scales.x.max=max;chart.update('none');
}
function renderRows(target,rows,history=false,page=0){
  const limit=history?PER_PAGE:10;const list=[...rows].reverse().slice(page*limit,(page+1)*limit);
  if(!list.length){target.innerHTML=`<tr><td colspan="${history?5:4}" class="empty-cell">Tidak ada data.</td></tr>`;return;}
  target.innerHTML=list.map((r,i)=>`<tr>${history?`<td>${page*limit+i+1}</td>`:''}<td>${tformat(r.ts)}</td><td>${num(r.temperature_c)}</td><td>${num(r.humidity_percent)}</td><td>${r.kind||'Log'}</td></tr>`).join('');
}
function renderHistoryTable(){
  const pages=Math.max(1,Math.ceil(state.historyRows.length/PER_PAGE));state.historyPage=Math.min(state.historyPage,pages-1);
  renderRows($('history-rows'),state.historyRows,true,state.historyPage);
  $('log-count').textContent=`${state.historyRows.length.toLocaleString('id-ID')} pengukuran`;
  $('page-count').textContent=`Halaman ${state.historyPage+1} dari ${pages}`;
  $('prev-page').disabled=state.historyPage===0;$('next-page').disabled=state.historyPage===pages-1;
}
function drawLive(){
  const now=Date.now();state.liveRows=state.liveRows.filter(r=>r.ts>=now-PERIODS.live&&r.ts<=now+30000).slice(-400);
  const msg=state.mqttOnline?`${state.liveRows.length} titik • Live 15 menit terakhir`:`MQTT OFF • ${state.liveRows.length} titik sementara`;
  if(state.dashboardPeriod==='live'){draw(state.chartDashboard,state.liveRows,'live');$('chart-info').textContent=msg;}
  if(state.historyPeriod==='live'){draw(state.chartHistory,state.liveRows,'live');$('history-chart-info').textContent=msg+' • Tabel tetap dari Firebase';}
}
function rememberLive(row){
  if(!isReading(row))return;
  const data=readRow(row,'MQTT');state.mqttLast=data;
  if(data.ts>Date.now()-PERIODS.live&&data.ts<Date.now()+30000){
    const i=state.liveRows.findIndex(x=>x.ts===data.ts);if(i>=0)state.liveRows[i]=data;else state.liveRows.push(data);
    state.liveRows.sort((a,b)=>a.ts-b.ts);
  }
  drawLive();applyLive();
}
function applyLive(){
  const mqttFresh=state.mqttOnline&&state.mqttLast&&Math.abs(Date.now()-state.mqttLast.ts)<45000;
  const data=mqttFresh?state.mqttLast:state.latest;
  $('metric-temp').textContent=data?num(data.temperature_c):'--';$('metric-hum').textContent=data?num(data.humidity_percent):'--';
  const online=data&&Date.now()-data.ts<180000&&Date.now()-data.ts>=-30000;
  $('device-status').textContent=!data?'Menunggu':online?'Online':'Offline';
  $('device-dot').className='status-indicator'+(!data?'':online?' online':' offline');
  $('last-time').textContent=data?'Terakhir: '+tformat(data.ts):'Belum ada data';$('system-updated').textContent=data?tformat(data.ts):'—';
  $('data-source').textContent=mqttFresh?'LIVE • EMQX MQTT':'FIREBASE • DATABASE';
  $('mqtt-status').textContent=state.mqttOnline?'MQTT: LIVE':'MQTT: OFF';$('mqtt-status').classList.toggle('on',state.mqttOnline);
  $('firebase-status').textContent=state.firebaseOnline?'Firebase: Terhubung':'Firebase: Belum terhubung';
}
async function refreshLatest(){
  if(!state.loggedIn)return;
  try{const d=(await api('/api/data?type=latest')).data;state.latest=isReading(d)?readRow(d,'Log'):null;state.firebaseOnline=true;applyLive();}
  catch(e){state.firebaseOnline=false;applyLive();}
}
async function refreshDashboard(){
  if(!state.loggedIn)return;
  const period=state.dashboardPeriod;const fetchPeriod=period==='live'?'1h':period;
  if(period==='live')drawLive();
  try{const response=await api(`/api/data?type=range&period=${fetchPeriod}`);
    if(state.dashboardPeriod!==period)return;
    const rows=(response.rows||[]).filter(isReading).map(r=>readRow(r,fetchPeriod==='30d'?'Rata-rata/jam':'Log'));
    state.dashboardRows=rows;renderRows($('recent-rows'),rows);
    if(period!=='live'){draw(state.chartDashboard,rows,period);$('chart-info').textContent=`${rows.length} titik • Firebase`;}state.firebaseOnline=true;applyLive();
  }catch(e){note('Gagal memuat grafik: '+e.message,true);state.firebaseOnline=false;applyLive();}
}
async function refreshHistory(){
  if(!state.loggedIn)return;
  const period=state.historyPeriod;
  if(period==='live'){drawLive();return;}
  try{const response=await api(`/api/data?type=range&period=${period}`);
    if(state.historyPeriod!==period)return;
    state.historyRows=(response.rows||[]).filter(isReading).map(r=>readRow(r,period==='30d'?'Rata-rata/jam':'Log'));
    state.historyLogPeriod=period;state.historyPage=0;draw(state.chartHistory,state.historyRows,period);
    $('history-chart-info').textContent=`${state.historyRows.length} titik • Firebase`;renderHistoryTable();state.firebaseOnline=true;applyLive();
  }catch(e){note('Gagal membaca riwayat: '+e.message,true);state.firebaseOnline=false;applyLive();}
}
function navigate(page){
  state.page=page;document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${page}`));
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  const titles={dashboard:['Dashboard','Monitoring Dashboard'],history:['Riwayat Data','Riwayat Pengukuran'],device:['Perangkat','Informasi Perangkat'],storage:['Penyimpanan','Backup & Penyimpanan']};
  $('breadcrumb-title').textContent=titles[page][0];$('top-title').textContent=titles[page][1];
  if(page==='dashboard'){refreshDashboard();setTimeout(()=>state.chartDashboard?.resize(),50);}
  if(page==='history'){refreshHistory();setTimeout(()=>state.chartHistory?.resize(),50);}
  window.scrollTo({top:0,behavior:'smooth'});
}
function downloadCSV(name,rows){
  const esc=v=>{let s=String(v??'');if(/^[=+@-]/.test(s)&&Number.isNaN(Number(s)))s="'"+s;return `"${s.replaceAll('"','""')}"`;};
  const content='\uFEFF'+rows.map(r=>r.map(esc).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function csvRows(rows){return[['jenis','waktu_wib','timestamp_ms','temperature_c','humidity_percent','jumlah_sampel'],...rows.map(r=>[r.kind||'Log',tformat(r.ts),r.ts,r.temperature_c,r.humidity_percent,r.count||''])];}
async function backupMonth(){
  const month=$('archive-month').value.replace('-','');
  if(!/^20\d{4}$/.test(month))return note('Pilih bulan terlebih dahulu',true);
  const button=$('backup-month');button.disabled=true;
  const all=[];
  try{
    for(let part=0;part<6;part++){
      $('archive-info').textContent=`Mengambil log Firebase ${part+1}/6 bagian...`;
      const result=await api(`/api/data?type=month&month=${month}&part=${part}`);
      all.push(...(result.rows||[]).filter(isReading).map(r=>readRow(r,r.kind||'Log')));
    }
    if(!all.length){$('archive-info').textContent='Bulan ini belum ada data';return;}
    all.sort((a,b)=>a.ts-b.ts);
    downloadCSV(`AnggrekSense_Backup_${month}.csv`,csvRows(all));
    $('archive-info').textContent=`Backup ${month}: ${all.length} baris. Data Firebase tidak dihapus.`;
  }catch(e){$('archive-info').textContent='Backup gagal: '+e.message;}
  finally{button.disabled=false;}
}
function stopLive(manual=false){
  state.wantLive=false;state.liveGeneration++;clearTimeout(state.liveReconnect);state.liveReconnect=null;
  const s=state.liveSocket;state.liveSocket=null;if(s){try{s.close();}catch{}}
  state.mqttOnline=false;state.mqttLast=null;applyLive();
  if(manual)$('mqtt-info').textContent='MQTT diputuskan';
}
function scheduleReconnect(){
  if(!state.wantLive||!state.loggedIn||state.liveReconnect)return;
  const wait=Math.min(15000,1000*Math.pow(2,Math.min(state.liveRetry++,4)));
  $('mqtt-info').textContent=`Menyambung ulang dalam ${Math.round(wait/1000)} detik...`;
  state.liveReconnect=setTimeout(()=>{state.liveReconnect=null;startLive();},wait);
}
function startLive(){
  if(!state.loggedIn)return;
  stopLive();state.wantLive=true;
  const attempt=++state.liveGeneration;
  try{
    const ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/live`);
    state.liveSocket=ws;$('mqtt-info').textContent='Menyambungkan EMQX...';
    ws.onmessage=event=>{
      if(state.liveSocket!==ws||attempt!==state.liveGeneration)return;
      try{const m=JSON.parse(event.data);
        if(m.type==='status'){state.mqttOnline=Boolean(m.connected);$('mqtt-info').textContent=m.detail||'Menghubungkan...';if(m.connected)state.liveRetry=0;applyLive();drawLive();}
        else if(m.type==='reading')rememberLive(m.data);
        else if(m.type==='error'){$('mqtt-info').textContent=m.message||'MQTT gagal';if(m.fatal){state.wantLive=false;note('MQTT: '+m.message,true);ws.close();}}
      }catch{}
    };
    ws.onerror=()=>{if(state.liveSocket===ws)$('mqtt-info').textContent='WebSocket gagal. Periksa Vercel Logs.';};
    ws.onclose=()=>{if(state.liveSocket!==ws)return;state.liveSocket=null;state.mqttOnline=false;applyLive();drawLive();scheduleReconnect();};
  }catch(e){$('mqtt-info').textContent=e.message;scheduleReconnect();}
}
async function openDashboard(){
  state.loggedIn=true;$('login-overlay').classList.add('hidden');$('user-email').textContent='Dashboard';
  if(!state.chartDashboard)state.chartDashboard=createChart($('sensor-chart'));
  if(!state.chartHistory)state.chartHistory=createChart($('history-chart'));
  startLive();await Promise.all([refreshLatest(),refreshDashboard()]);
}
function closeDashboard(){
  stopLive();state.loggedIn=false;state.latest=null;state.firebaseOnline=false;state.liveRows=[];state.historyRows=[];
  $('login-overlay').classList.remove('hidden');applyLive();
}
function setup(){
  document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
  document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>navigate(b.dataset.jump));
  document.querySelectorAll('[data-periods]').forEach(group=>group.querySelectorAll('button').forEach(b=>b.onclick=()=>{
    group.querySelectorAll('button').forEach(el=>el.classList.toggle('active',el===b));
    if(group.dataset.periods==='dashboard'){state.dashboardPeriod=b.dataset.period;refreshDashboard();}
    else{state.historyPeriod=b.dataset.period;refreshHistory();}
  }));
  $('refresh-history').onclick=refreshHistory;
  $('prev-page').onclick=()=>{if(state.historyPage>0){state.historyPage--;renderHistoryTable();}};
  $('next-page').onclick=()=>{if((state.historyPage+1)*PER_PAGE<state.historyRows.length){state.historyPage++;renderHistoryTable();}};
  $('export-period').onclick=()=>{if(!state.historyRows.length)return note('Tidak ada data untuk diekspor.',true);downloadCSV(`AnggrekSense_${state.historyLogPeriod}.csv`,csvRows(state.historyRows));};
  $('backup-month').onclick=backupMonth;$('archive-month').value=new Date().toISOString().slice(0,7);
  $('mqtt-connect').onclick=startLive;$('mqtt-disconnect').onclick=()=>stopLive(true);
  $('logout').onclick=async()=>{try{await api('/api/session',{method:'DELETE'});}catch{}closeDashboard();};
  $('status-id').textContent=DEVICE_ID;$('aside-device').textContent=DEVICE_ID;
  function tick(){$('clock').textContent=tformat(Date.now(),true);if(state.loggedIn){applyLive();drawLive();}}
  tick();setInterval(tick,15000);
  setInterval(()=>{if(!state.loggedIn)return;refreshLatest();if(state.page==='dashboard')refreshDashboard();if(state.page==='history')refreshHistory();},60000);
  $('login-form').onsubmit=async e=>{
    e.preventDefault();$('login-error').textContent='';const button=$('login-form').querySelector('button');button.disabled=true;
    try{await api('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('login-password').value})});$('login-password').value='';await openDashboard();}
    catch(error){$('login-error').textContent=error.message;}finally{button.disabled=false;}
  };
  api('/api/session').then(d=>{if(d.authenticated)openDashboard();}).catch(()=>{});
}
setup();
