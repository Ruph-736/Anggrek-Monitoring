import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getDatabase, ref, onValue, get, query, orderByChild, startAt, endAt, remove } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import { FIREBASE_CONFIG, DEVICE_ID, MQTT_WSS_URL, MQTT_TOPIC, ADMIN_EMAIL } from './config.js';

const $ = id => document.getElementById(id);
const BASE = `devices/${DEVICE_ID}`;
const WIB = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false });
const SHORT_WIB = new Intl.DateTimeFormat('id-ID', { timeZone:'Asia/Jakarta', day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit' });
const PERIODS = {'1h':3600000,'6h':21600000,'24h':86400000,'30d':2592000000};
const PER_PAGE = 50;
const state = { page:'dashboard', dashboardPeriod:'1h', historyPeriod:'24h', historyPage:0, dashboardRows:[], historyRows:[], latest:null, mqttLast:null, mqttOnline:false, firebaseOnline:false, mqttClient:null, unsubLatest:null, auth:null, db:null, chartDashboard:null, chartHistory:null, backupMonth:'' };

function formatTime(ms,short=false){return Number.isFinite(Number(ms)) && Number(ms)>0 ? (short?SHORT_WIB:WIB).format(new Date(Number(ms))) : '—';}
function fmt(v){return Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '--';}
function toast(msg,bad=false){const e=$('notice');e.textContent=msg;e.classList.toggle('error',bad);e.classList.remove('hidden');}
function path(type,month){return `${BASE}/${type}/${month}`;}
function monthKeyUTC(ts){const d=new Date(ts);return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}`;}
function monthsBetween(from,to){const out=[];const d=new Date(from);d.setUTCDate(1);d.setUTCHours(0,0,0,0);const end=new Date(to);end.setUTCDate(1);end.setUTCHours(0,0,0,0);while(d<=end&&out.length<18){out.push(monthKeyUTC(d.getTime()));d.setUTCMonth(d.getUTCMonth()+1);}return out;}
function dateRange(period){const end=Date.now();return [end-PERIODS[period],end];}
function validReading(row){return row && Number.isFinite(Number(row.ts)) && Number.isFinite(Number(row.temperature_c)) && Number.isFinite(Number(row.humidity_percent));}
function cleanRow(row,kind){return {...row, ts:Number(row.ts),temperature_c:Number(row.temperature_c),humidity_percent:Number(row.humidity_percent),kind};}

async function fetchRange(type,from,to){
  const months=monthsBetween(from,to);
  const results=await Promise.all(months.map(async month=>{
    const q=query(ref(state.db,path(type,month)),orderByChild('ts'),startAt(from),endAt(to));
    const snap=await get(q);
    if(!snap.exists())return [];
    return Object.values(snap.val()).filter(validReading).map(v=>cleanRow(v,type==='hourly'?'Rata-rata/jam':'Pengukuran'));
  }));
  return results.flat().sort((a,b)=>a.ts-b.ts);
}

function makeChart(canvas){
  if(!window.Chart)throw new Error('Chart.js belum termuat (cek koneksi internet).');
  return new window.Chart(canvas.getContext('2d'),{
    type:'line',data:{datasets:[
      {label:'Suhu (°C)',data:[],borderColor:'#f49c5c',backgroundColor:'rgba(244,156,92,.08)',yAxisID:'t',pointRadius:0,pointHoverRadius:4,borderWidth:2.4,tension:.22,spanGaps:false},
      {label:'Kelembapan (%RH)',data:[],borderColor:'#208de1',backgroundColor:'rgba(32,141,225,.08)',yAxisID:'h',pointRadius:0,pointHoverRadius:4,borderWidth:2.4,tension:.22,spanGaps:false}
    ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'nearest',intersect:false},animation:false,normalized:true,plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>items.length?formatTime(items[0].parsed.x):''}}},scales:{x:{type:'linear',ticks:{color:'#91a0b4',maxTicksLimit:6,callback:v=>formatTime(v,true),font:{size:10}},grid:{color:'#eef2f7'},border:{display:false}},t:{type:'linear',position:'left',ticks:{color:'#b18d75',font:{size:10}},grid:{color:'#eef2f7'},border:{display:false},title:{display:true,text:'Suhu (°C)',color:'#c39475',font:{size:10}}},h:{type:'linear',position:'right',min:0,max:100,ticks:{color:'#659ac3',font:{size:10}},grid:{drawOnChartArea:false},border:{display:false},title:{display:true,text:'Kelembapan (%)',color:'#659ac3',font:{size:10}}}}}}
  });
}

function chartPoints(rows,field,period){
  const step=period==='30d'?3600000:60000;
  const points=[];
  for (let i=0;i<rows.length;i++){
    if (i>0 && (rows[i].ts - rows[i-1].ts)>step*2.8){
      points.push({x:Math.round((rows[i].ts+rows[i-1].ts)/2),y:null});
    }
    points.push({x:rows[i].ts,y:rows[i][field]});
  }
  return points;
}
function renderChart(chart,rows,period){
  if(!chart)return;
  chart.data.datasets[0].data=chartPoints(rows,'temperature_c',period);
  chart.data.datasets[1].data=chartPoints(rows,'humidity_percent',period);
  const [start,end]=dateRange(period);
  chart.options.scales.x.min=start;
  chart.options.scales.x.max=end;
  chart.update('none');
}
function renderTable(tbody,rows,history=false,page=0){
  const count=history?PER_PAGE:10;
  const show=[...rows].reverse().slice(page*count,(page+1)*count);
  if(!show.length){tbody.innerHTML=`<tr><td colspan="${history?5:4}" class="empty-cell">Tidak ada data pada periode ini.</td></tr>`;return;}
  tbody.innerHTML=show.map((row,i)=>history
    ? `<tr><td>${page*count+i+1}</td><td>${formatTime(row.ts)}</td><td>${fmt(row.temperature_c)}</td><td>${fmt(row.humidity_percent)}</td><td>${row.kind}</td></tr>`
    : `<tr><td>${formatTime(row.ts)}</td><td>${fmt(row.temperature_c)}</td><td>${fmt(row.humidity_percent)}</td><td>${row.kind}</td></tr>`
  ).join('');
}
function renderHistoryTable(){
  const rows=state.historyRows;
  const pages=Math.max(1,Math.ceil(rows.length/PER_PAGE));
  state.historyPage=Math.min(state.historyPage,pages-1);
  renderTable($('history-rows'),rows,true,state.historyPage);
  $('log-count').textContent=`${rows.length.toLocaleString('id-ID')} data pada periode terpilih`;
  $('page-count').textContent=`Halaman ${state.historyPage+1} dari ${pages}`;
  $('prev-page').disabled=state.historyPage===0;
  $('next-page').disabled=state.historyPage>=pages-1;
}

async function refreshDashboard(){
  if(!state.db||!state.auth.currentUser)return;
  const period=state.dashboardPeriod;
  const [from,to]=dateRange(period);
  try{
    const rows=await fetchRange(period==='30d'?'hourly':'logs',from,to);
    if(period!==state.dashboardPeriod)return;
    state.dashboardRows=rows;
    renderChart(state.chartDashboard,rows,period);
    $('chart-info').textContent=`${rows.length.toLocaleString('id-ID')} titik • ${period==='30d'?'Rata-rata per jam':'Data per menit'}`;
    renderTable($('recent-rows'),rows);
    state.firebaseOnline=true;updateConnectivity();
  }catch(e){toast('Gagal membaca grafik Firebase: '+e.message,true);state.firebaseOnline=false;updateConnectivity();}
}
async function refreshHistory(){
  if(!state.db||!state.auth.currentUser)return;
  const period=state.historyPeriod;
  const [from,to]=dateRange(period);
  try{
    const rows=await fetchRange(period==='30d'?'hourly':'logs',from,to);
    if(period!==state.historyPeriod)return;
    state.historyRows=rows;state.historyPage=0;
    renderChart(state.chartHistory,rows,period);
    $('history-chart-info').textContent=`${rows.length.toLocaleString('id-ID')} titik • ${period==='30d'?'Agregasi per jam':'Log per menit'}`;
    renderHistoryTable();
    state.firebaseOnline=true;updateConnectivity();
  }catch(e){toast('Gagal memuat riwayat: '+e.message,true);state.firebaseOnline=false;updateConnectivity();}
}

function applyLive(){
  const liveMqtt=state.mqttOnline&&state.mqttLast&&Date.now()-state.mqttLast.ts<45000;
  const data=liveMqtt?state.mqttLast:state.latest;
  $('metric-temp').textContent=data?fmt(data.temperature_c):'--';
  $('metric-hum').textContent=data?fmt(data.humidity_percent):'--';
  const age=data?Date.now()-data.ts:Infinity;
  const live=age>=-30000&&age<=180000;
  $('device-status').textContent=!data?'Menunggu':(live?'Online':'Offline');
  $('device-dot').className='status-indicator'+(!data?'':(live?' online':' offline'));
  $('last-time').textContent=data?`Terakhir: ${formatTime(data.ts)}`:'Belum ada data';
  $('system-updated').textContent=data?formatTime(data.ts):'—';
  $('data-source').textContent=liveMqtt?'LIVE • EMQX MQTT':'FIREBASE • DATABASE';
}
function updateConnectivity(){
  $('mqtt-status').textContent=state.mqttOnline?'MQTT: LIVE':'MQTT: OFF';
  $('mqtt-status').classList.toggle('on',state.mqttOnline);
  $('firebase-status').textContent=state.firebaseOnline?'Firebase: Terhubung':'Firebase: Belum terhubung';
  applyLive();
}
function subscribeLatest(){
  if(state.unsubLatest){state.unsubLatest();state.unsubLatest=null;}
  state.unsubLatest=onValue(ref(state.db,`${BASE}/latest`),snap=>{
    const value=snap.val();
    state.latest=validReading(value)?cleanRow(value,'Pengukuran'):null;
    state.firebaseOnline=true;updateConnectivity();
  },e=>{state.firebaseOnline=false;toast('Tidak punya izin membaca latest. Periksa UID admin dan Rules: '+e.message,true);updateConnectivity();});
}
function navigate(page){
  state.page=page;
  document.querySelectorAll('.page').forEach(e=>e.classList.toggle('active',e.id===`page-${page}`));
  document.querySelectorAll('.nav-item').forEach(e=>e.classList.toggle('active',e.dataset.page===page));
  const label={dashboard:['Dashboard','Monitoring Dashboard'],history:['Riwayat Data','Riwayat Pengukuran'],device:['Perangkat','Informasi Perangkat'],storage:['Penyimpanan','Backup & Penyimpanan']}[page];
  $('breadcrumb-title').textContent=label[0];$('top-title').textContent=label[1];
  if(page==='dashboard'){refreshDashboard();setTimeout(()=>state.chartDashboard?.resize(),50);}
  if(page==='history'){refreshHistory();setTimeout(()=>state.chartHistory?.resize(),50);}
  window.scrollTo({top:0,behavior:'smooth'});
}

function downloadCSV(name,rows){
  const esc=v=>{let s=String(v??'');if(/^[=+@-]/.test(s)&&isNaN(Number(s)))s="'"+s;return `"${s.replaceAll('"','""')}"`;};
  const content='\uFEFF'+rows.map(r=>r.map(esc).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),15000);
}
function rowsToCSV(rows){return [['jenis','waktu_wib','timestamp_ms','temperature_c','humidity_percent','jumlah_sampel'],...rows.map(r=>[r.kind,formatTime(r.ts),r.ts,r.temperature_c,r.humidity_percent,r.count??''])];}
function monthRange(month){
  const y=Number(month.slice(0,4)),m=Number(month.slice(4,6))-1;
  if(y<2020||m<0||m>11)throw new Error('Bulan tidak valid');
  return [Date.UTC(y,m,1),Date.UTC(y,m+1,1)];
}
async function readWholeMonth(type,month){
  const snap=await get(ref(state.db,path(type,month)));
  return snap.exists()?Object.values(snap.val()).filter(validReading).map(v=>cleanRow(v,type==='logs'?'Pengukuran':'Rata-rata/jam')):[];
}
async function backupMonth(){
  const input=$('archive-month').value;
  if(!/^\d{4}-\d{2}$/.test(input))return toast('Pilih bulan arsip terlebih dahulu.',true);
  const month=input.replace('-','');
  state.backupMonth='';
  $('archive-info').textContent='Mengambil data Firebase untuk CSV…';
  try{
    const [raw,hourly]=await Promise.all([readWholeMonth('logs',month),readWholeMonth('hourly',month)]);
    const all=[...raw,...hourly].sort((a,b)=>a.ts-b.ts);
    if(!all.length){$('archive-info').textContent='Belum ada data di bulan ini.';return;}
    downloadCSV(`AnggrekSense_Backup_${month}.csv`,rowsToCSV(all));
    state.backupMonth=month;
    $('archive-info').textContent=`Backup ${month}: ${raw.length} log mentah + ${hourly.length} ringkasan/jam. Periksa file yang diunduh sebelum hapus.`;
  }catch(e){toast('Backup gagal: '+e.message,true);$('archive-info').textContent='Backup gagal. Jangan hapus data.';}
}
async function cleanupMonth(){
  const month=$('archive-month').value.replace('-','');
  if(!/^\d{6}$/.test(month))return toast('Pilih bulan yang valid.',true);
  const [,monthEnd]=monthRange(month);
  if(monthEnd>Date.now()-90*86400000)return toast('Hanya log dari bulan yang berakhir lebih dari 90 hari lalu dapat dihapus.',true);
  if(state.backupMonth!==month)return toast('Wajib backup CSV bulan yang sama terlebih dahulu pada sesi ini.',true);
  const answer=prompt(`Ini menghapus permanen LOG MENTAH bulan ${month}, namun ringkasan per jam tetap ada. Pastikan CSV sudah disimpan. Ketik HAPUS ${month} untuk lanjut:`);
  if(answer!==`HAPUS ${month}`)return;
  try{
    await remove(ref(state.db,path('logs',month)));
    state.backupMonth='';
    $('archive-info').textContent=`Log ${month} sudah dibersihkan. Ringkasan jam tetap tersimpan.`;
    toast(`Log mentah bulan ${month} berhasil dihapus. Simpan file backup CSV.`);
  }catch(e){toast('Penghapusan gagal: '+e.message,true);}
}

function connectMQTT(){
  if(!MQTT_WSS_URL)return toast('Isi MQTT_WSS_URL di file dashboard/config.js terlebih dahulu.',true);
  if(!window.mqtt)return toast('mqtt.js gagal dimuat (periksa koneksi internet).',true);
  const username=$('mqtt-user').value.trim(),password=$('mqtt-pass').value;
  if(!username||!password)return toast('Isi username dan password MQTT khusus dashboard.',true);
  disconnectMQTT();
  const client=window.mqtt.connect(MQTT_WSS_URL,{clientId:`anggrek-web-${Math.random().toString(16).slice(2)}`,username,password,clean:true,reconnectPeriod:5000,connectTimeout:8000});
  state.mqttClient=client;
  client.on('connect',()=>{state.mqttOnline=true;client.subscribe(MQTT_TOPIC);$('mqtt-info').textContent=`Terhubung MQTT WSS. Subscribe: ${MQTT_TOPIC}`;updateConnectivity();});
  client.on('close',()=>{state.mqttOnline=false;updateConnectivity();});
  client.on('error',e=>{$('mqtt-info').textContent='MQTT: '+e.message;state.mqttOnline=false;updateConnectivity();});
  client.on('message',(topic,payload)=>{
    if(topic!==MQTT_TOPIC)return;
    try{const row=JSON.parse(payload.toString());if(row.device_id!==DEVICE_ID||!validReading(row))return;state.mqttLast=cleanRow(row,'MQTT');applyLive();}catch(e){console.warn('Pesan MQTT tidak valid',e);}
  });
}
function disconnectMQTT(){
  if(state.mqttClient){state.mqttClient.end(true);state.mqttClient=null;}
  state.mqttOnline=false;state.mqttLast=null;updateConnectivity();
}

async function startAfterLogin(user){
  $('login-overlay').classList.add('hidden');$('user-email').textContent=user.email||'Admin';
  subscribeLatest();
  if(!state.chartDashboard)state.chartDashboard=makeChart($('sensor-chart'));
  if(!state.chartHistory)state.chartHistory=makeChart($('history-chart'));
  await refreshDashboard();
}
function stopAfterLogout(){
  disconnectMQTT();
  if(state.unsubLatest){state.unsubLatest();state.unsubLatest=null;}
  state.latest=null;state.firebaseOnline=false;state.historyRows=[];state.dashboardRows=[];
  $('login-overlay').classList.remove('hidden');
  updateConnectivity();
}

function setupUI(){
  document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
  document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.jump)));
  document.querySelectorAll('[data-periods]').forEach(group=>group.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    group.querySelectorAll('button').forEach(el=>el.classList.toggle('active',el===b));
    if(group.dataset.periods==='dashboard'){state.dashboardPeriod=b.dataset.period;refreshDashboard();}
    else{state.historyPeriod=b.dataset.period;refreshHistory();}
  })));
  $('refresh-history').addEventListener('click',refreshHistory);
  $('prev-page').addEventListener('click',()=>{if(state.historyPage>0){state.historyPage--;renderHistoryTable();}});
  $('next-page').addEventListener('click',()=>{if((state.historyPage+1)*PER_PAGE<state.historyRows.length){state.historyPage++;renderHistoryTable();}});
  $('export-period').addEventListener('click',()=>{if(!state.historyRows.length)return toast('Tidak ada data untuk diekspor.',true);downloadCSV(`AnggrekSense_${state.historyPeriod}_${new Date().toISOString().slice(0,10)}.csv`,rowsToCSV(state.historyRows));});
  $('backup-month').addEventListener('click',backupMonth);
  $('cleanup-month').addEventListener('click',cleanupMonth);
  $('archive-month').value=new Date().toISOString().slice(0,7);
  $('archive-month').addEventListener('change',()=>{state.backupMonth='';$('archive-info').textContent='Bulan berubah. Silakan backup lagi sebelum penghapusan.';});
  $('mqtt-connect').addEventListener('click',connectMQTT);
  $('mqtt-disconnect').addEventListener('click',disconnectMQTT);
  $('logout').addEventListener('click',()=>state.auth&&signOut(state.auth));
  $('status-id').textContent=DEVICE_ID;$('aside-device').textContent=DEVICE_ID;
  function clock(){ $('clock').textContent=formatTime(Date.now(),true); if(state.auth?.currentUser)applyLive(); }
  clock();setInterval(clock,15000);
  setInterval(()=>{if(state.auth?.currentUser){if(state.page==='dashboard')refreshDashboard();else if(state.page==='history')refreshHistory();}},60000);
}

function main(){
  setupUI();
  if(Object.values(FIREBASE_CONFIG).some(s=>!s||String(s).includes('GANTI_'))){
    $('login-error').textContent='Isi dashboard/config.js dengan konfigurasi Firebase asli sebelum membuka dashboard.';
    return;
  }
  if(!ADMIN_EMAIL || ADMIN_EMAIL.includes('GANTI_')){ $('login-error').textContent='Isi ADMIN_EMAIL pada config.js terlebih dahulu.'; return; }
  const app=initializeApp(FIREBASE_CONFIG);
  state.auth=getAuth(app);state.db=getDatabase(app);
  $('login-form').addEventListener('submit',async e=>{
    e.preventDefault();$('login-error').textContent='';
    // DIUBAH: Password-only UI; Firebase Authentication tetap memverifikasi email admin + password.
    try{await signInWithEmailAndPassword(state.auth,ADMIN_EMAIL.trim(),$('login-password').value);$('login-password').value='';}
    catch(err){
      const messages={
        'auth/invalid-credential':'Password salah atau akun admin belum dibuat di Firebase Authentication.',
        'auth/invalid-email':'Email admin di config.js tidak valid.',
        'auth/unauthorized-domain':'Domain website belum ditambahkan ke Firebase Authentication > Authorized domains.',
        'auth/too-many-requests':'Terlalu banyak percobaan login. Coba lagi nanti.',
        'auth/network-request-failed':'Koneksi internet atau akses Firebase terganggu.',
        'auth/invalid-api-key':'apiKey Firebase di config.js belum benar.'
      };
      $('login-error').textContent=messages[err.code]||('Login gagal: '+err.message);
    }
  });
  onAuthStateChanged(state.auth,user=>{if(user)startAfterLogin(user).catch(err=>toast('Dashboard gagal memuat: '+err.message,true));else stopAfterLogout();});
}
main();
