// AnggrekSense: login cookie Vercel; Firebase dibaca lewat backend saja.
import { DEVICE_ID } from './config.js';
const $=id=>document.getElementById(id);
const WIB=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const SHORT=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const PERIODS={'1h':3600000,'6h':21600000,'24h':86400000,'7d':604800000,'30d':2592000000,live:900000};
const state={loggedIn:false,page:'dashboard',dashboardPeriod:'live',historyPeriod:'24h',historyLogPeriod:'24h',latest:null,mqttLast:null,mqttOnline:false,firebaseOnline:false,liveRows:[],dashboardRows:[],historyRows:[],historyPage:0,historyNextCursor:null,historyPageCursors:[null],historyRequestId:0,historyLoadedPeriod:'',historyChartAt:0,dashboardChartAt:0,dashboardChartPeriod:'',exportBusy:false,chartDashboard:null,chartHistory:null,liveSocket:null,liveReconnect:null,wantLive:false,liveGeneration:0,liveRetry:0};
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
  const gap=period==='live'?5000:period==='30d'?2100000:period==='7d'?360000:60000;
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
  if(!list.length){target.innerHTML=`<tr><td colspan="${history?4:3}" class="empty-cell">Tidak ada data.</td></tr>`;return;}
  target.innerHTML=list.map((r,i)=>`<tr>${history?`<td>${page*limit+i+1}</td>`:''}<td>${tformat(r.ts)}</td><td>${num(r.temperature_c)}</td><td>${num(r.humidity_percent)}</td></tr>`).join('');
}
function renderHistoryTable(){
  const rows=state.historyRows;
  const target=$('history-rows');
  if(!rows.length){
    target.innerHTML='<tr><td colspan="4" class="empty-cell">Belum ada log asli untuk halaman ini.</td></tr>';
  }else{
    target.innerHTML=rows.map((r,i)=>`<tr><td>${state.historyPage*PER_PAGE+i+1}</td><td>${tformat(r.ts)}</td><td>${num(r.temperature_c)}</td><td>${num(r.humidity_percent)}</td></tr>`).join('');
  }
  $('log-count').textContent=` ${rows.length} pengukuran pada halaman ini • waktu WIB lengkap`.trim();
  $('page-count').textContent=`Halaman ${state.historyPage+1}`;
  $('prev-page').disabled=state.historyPage===0;
  $('next-page').disabled=state.historyNextCursor===null;
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
  $('firebase-status').textContent=state.firebaseOnline?'Firebase: Dapat dibaca':'Firebase: Belum dapat dibaca';
}
async function refreshLatest(){
  if(!state.loggedIn)return;
  try{const d=(await api('/api/data?type=latest')).data;state.latest=isReading(d)?readRow(d,'Log'):null;state.firebaseOnline=true;applyLive();}
  catch(e){state.firebaseOnline=false;applyLive();}
}
async function refreshDashboard(){
  if(!state.loggedIn)return;
  const period=state.dashboardPeriod;
  const fetchPeriod=period==='live'?'1h':period;
  if(period==='live')drawLive();
  // Membaca seluruh 30 hari dari Firebase mahal; jangan polling setiap menit.
  const chartTTL=period==='30d'?3600000:period==='7d'?600000:0;
  if(chartTTL&&state.dashboardChartPeriod===period&&state.dashboardChartAt&&Date.now()-state.dashboardChartAt<chartTTL)return;
  try{
    const response=await api(`/api/data?type=range&period=${fetchPeriod}`);
    if(state.dashboardPeriod!==period)return;
    const rows=(response.rows||[]).filter(isReading).map(r=>readRow(r,'Log asli'));
    state.dashboardRows=rows;renderRows($('recent-rows'),rows);
    if(period!=='live'){
      draw(state.chartDashboard,rows,period);
      $('chart-info').textContent=`${rows.length} titik pengukuran asli • tanpa rata-rata`+
        (response.sampled?' (dipilih untuk mempercepat grafik)':'');
    }
    if(period==='30d'||period==='7d'){state.dashboardChartAt=Date.now();state.dashboardChartPeriod=period;}
    state.firebaseOnline=true;applyLive();
  }catch(e){note('Gagal memuat grafik: '+e.message,true);state.firebaseOnline=false;applyLive();}
}
async function refreshHistory(reset=false){
  if(!state.loggedIn)return;
  const period=state.historyPeriod;
  if(reset||state.historyLoadedPeriod!==period){
    state.historyPage=0;state.historyPageCursors=[null];state.historyNextCursor=null;
    state.historyLoadedPeriod=period;state.historyChartAt=0;
  }
  const requestId=++state.historyRequestId;
  const before=state.historyPageCursors[state.historyPage];
  try{
    const periodForLogs=period==='live'?'1h':period;
    const params=`type=history&period=${periodForLogs}`+(before===null?'':`&before=${before}`);
    const chartTTL=period==='30d'?3600000:period==='7d'?600000:0;
    const chartIsFresh=chartTTL&&state.historyChartAt&&Date.now()-state.historyChartAt<chartTTL;
    const [pageResponse,chartResponse]=await Promise.all([
      api('/api/data?'+params),
      period==='live'||chartIsFresh?Promise.resolve(null):api(`/api/data?type=range&period=${period}`)
    ]);
    if(requestId!==state.historyRequestId||state.historyPeriod!==period)return;
    state.historyRows=(pageResponse.rows||[]).filter(isReading).map(r=>readRow(r,'Log asli'));
    state.historyNextCursor=pageResponse.nextCursor??null;
    state.historyLogPeriod=period;
    if(chartResponse){
      const rows=(chartResponse.rows||[]).filter(isReading).map(r=>readRow(r,'Log asli'));
      draw(state.chartHistory,rows,period);
      $('history-chart-info').textContent=`${rows.length} titik asli dari Firebase, tanpa rata-rata`+
        (chartResponse.sampled?' • sebagian titik ditampilkan agar grafik ringan':'');
      if(period==='30d'||period==='7d')state.historyChartAt=Date.now();
    }else if(period==='live')drawLive();
    renderHistoryTable();state.firebaseOnline=true;applyLive();
  }catch(e){
    if(requestId===state.historyRequestId){note('Gagal membaca riwayat: '+e.message,true);state.firebaseOnline=false;applyLive();}
  }
}

function navigate(page){
  state.page=page;document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${page}`));
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  const titles={dashboard:['Dashboard','Monitoring Dashboard'],history:['Riwayat Data','Riwayat Pengukuran'],device:['Perangkat','Informasi Perangkat'],storage:['Penyimpanan','Backup & Penyimpanan']};
  $('breadcrumb-title').textContent=titles[page][0];$('top-title').textContent=titles[page][1];
  if(page==='dashboard'){refreshDashboard();setTimeout(()=>state.chartDashboard?.resize(),50);}
  if(page==='history'){refreshHistory(true);setTimeout(()=>state.chartHistory?.resize(),50);}
  window.scrollTo({top:0,behavior:'smooth'});
}
function downloadCSV(name,rows){
  const esc=v=>{let s=String(v??'');if(/^[=+@-]/.test(s)&&Number.isNaN(Number(s)))s="'"+s;return `"${s.replaceAll('"','""')}"`;};
  const content='\uFEFF'+rows.map(r=>r.map(esc).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
// Timestamp lengkap yang mudah dibaca dan diurutkan di Excel: YYYY-MM-DD HH:mm:ss WIB.
function timestampWIB(ts){return new Date(Number(ts)+7*3600000).toISOString().slice(0,19).replace('T',' ');}
function csvRows(rows){
  return [['tanggal_wib','waktu_wib','timestamp_unix_ms','suhu_c','kelembapan_persen'],
    ...rows.map(r=>[timestampWIB(r.ts).slice(0,10),timestampWIB(r.ts).slice(11),r.ts,r.temperature_c,r.humidity_percent])];
}
// Rentang kalender WIB: 00:00:00 pada tanggal awal sampai 23:59:59.999 tanggal akhir.
function exportDateRange(startDate,endDate){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(endDate))
    throw new Error('Pilih tanggal awal dan akhir terlebih dahulu');
  const day=86400000;
  const from=Date.parse(`${startDate}T00:00:00+07:00`);
  const toEnd=Date.parse(`${endDate}T00:00:00+07:00`)+day-1;
  const to=Math.min(toEnd,Date.now());
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||startDate>endDate||from>to)
    throw new Error('Rentang tanggal tidak valid atau tanggal berada di masa depan');
  if(to-from>366*day)
    throw new Error('Maksimal 366 hari per ekspor. Pilih rentang lebih pendek');
  return {from,to};
}
async function exportPeriod(){
  if(!state.loggedIn||state.exportBusy)return;
  const button=$('export-period');
  let from,to;
  const first=$('export-from').value,last=$('export-to').value;
  try{({from,to}=exportDateRange(first,last));}
  catch(e){note(e.message,true);return;}
  state.exportBusy=true;button.disabled=true;
  let after=null,all=[],parts=0;
  try{
    do{
      const url=`/api/data?type=export&from=${from}&to=${to}`+(after===null?'':`&after=${after}`);
      const result=await api(url);
      all.push(...(result.rows||[]).filter(isReading).map(r=>readRow(r,'Log')));
      after=result.nextCursor??null;parts++;
      button.textContent=`Mengunduh... ${all.length.toLocaleString('id-ID')} baris`;
      if(parts>1000)throw new Error('Terlalu banyak halaman data');
    }while(after!==null);
    if(!all.length){note(`Tidak ada log Firebase dari ${first} sampai ${last}.`,true);return;}
    downloadCSV(`AnggrekSense_${first}_sampai_${last}.csv`,csvRows(all));
    note(`CSV ${first} hingga ${last}: ${all.length.toLocaleString('id-ID')} log asli dengan waktu WIB lengkap.`);
  }catch(e){note('Gagal mengunduh riwayat: '+e.message,true);}
  finally{button.disabled=false;button.textContent='↓ Unduh CSV';state.exportBusy=false;}
}

async function backupMonth(){
  const month=$('archive-month').value.replace('-','');
  if(!/^20\d{4}$/.test(month))return note('Pilih bulan terlebih dahulu',true);
  const button=$('backup-month');button.disabled=true;
  const all=[];
  try{
    for(let part=0;part<6;part++){
      $('archive-info').textContent=`Mengambil log Firebase ${part+1}/6 bagian...`;
      const result=await api(`/api/data?type=month&month=${month}&part=${part}`);
      all.push(...(result.rows||[]).filter(isReading).map(r=>readRow(r,'Log asli')));
    }
    if(!all.length){$('archive-info').textContent='Bulan ini belum ada data';return;}
    all.sort((a,b)=>a.ts-b.ts);
    downloadCSV(`AnggrekSense_Backup_${month}.csv`,csvRows(all));
    $('archive-info').textContent=`Backup ${month}: ${all.length} log asli dengan timeline WIB lengkap. Data Firebase tidak dihapus.`;
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
    else{state.historyPeriod=b.dataset.period;refreshHistory(true);}
  }));
  $('refresh-history').onclick=()=>refreshHistory(true);
  $('prev-page').onclick=()=>{if(state.historyPage>0){state.historyPage--;refreshHistory();}};
  $('next-page').onclick=()=>{if(state.historyNextCursor!==null){state.historyPageCursors[state.historyPage+1]=state.historyNextCursor;state.historyPage++;refreshHistory();}};
  // Default ekspor: 7 hari kalender WIB terakhir, termasuk hari ini.
  const today=timestampWIB(Date.now()).slice(0,10);
  const sevenDaysAgo=timestampWIB(Date.now()-6*86400000).slice(0,10);
  $('export-from').value=sevenDaysAgo;
  $('export-to').value=today;
  $('export-from').max=today;
  $('export-to').max=today;
  $('export-period').onclick=exportPeriod;
  $('backup-month').onclick=backupMonth;$('archive-month').value=timestampWIB(Date.now()).slice(0,7);
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
