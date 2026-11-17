/* O'Roots — بوابة الحساسات (ESP32 وغيره) ← Firestore
   بتشتغل على أي جهاز في شبكة المزرعة (Raspberry Pi / PC / سيرفر) وبتستقبل قراءات من الحساسات على HTTP،
   وبتسجّلها في نفس شكل القراءات اليدوية اللي التطبيق بيقراه (readings/<مصدر>_<نظام>_<تاريخ>)، فبتظهر في المخططات والتقارير.

   التشغيل:
     export FIREBASE_SERVICE_ACCOUNT='{...json...}'      # أو GOOGLE_APPLICATION_CREDENTIALS=/path/key.json
     export SENSOR_API_KEY='كلمة-سر-طويلة-عشوائية'
     export SENSOR_CONFIG=./sensors.config.json             # أجهزتك (شوف sensors.config.example.json)
     node sensor-gateway.js                                 # بيسمع على 0.0.0.0:8787 (PORT / HOST لتغييرهم)

   الحساسات بتبعت:  POST /ingest   header: x-api-key: <SENSOR_API_KEY>
     {"device":"lg1-climate","temp":26.4,"rh":61,"lux":3500}          ← مناخ
     {"device":"s1-irrigation","ph":5.9,"ec":2.1,"temp":22.3}         ← مياه (ري/صرف/خزان)
   حماية الحصة المجانية: كل جهاز بيتسجّل منه قراءة واحدة كل MIN_INTERVAL_MIN دقيقة (افتراضي 10) والباقي بيتتجاهل، وفي حد أقصى لعدد الكتابات في اليوم. */
'use strict';
const http = require('http');
const TZ = 'Africa/Cairo';
const RANGES = {temp: [-10, 70], rh: [0, 100], lux: [0, 250000], ph: [0, 14], ec: [0, 20]};   // خارج المدى = غالبًا حساس عطلان، بنرفض القراءة
const safePart = s => String(s).replace(/\//g, '-').slice(0, 300);
/* مقارنة المفتاح بزمن ثابت (عشان ما يتخمّنش بقياس الزمن) */
const crypto = require('crypto');
function keyOk(got, want){ const a = crypto.createHash('sha256').update(String(got || '')).digest(), b = crypto.createHash('sha256').update(String(want)).digest(); return crypto.timingSafeEqual(a, b); }

function cairoParts(ms){
  const p = {};
  new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
  return {date: `${p.year}-${p.month}-${p.day}`, ts: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`};
}
function loadConfig(raw){
  const cfg = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if(!cfg || typeof cfg.devices !== 'object') throw new Error('sensors config: devices مطلوبة');
  Object.entries(cfg.devices).forEach(([id, d]) => {
    if(d.type === 'climate'){ if(!d.greenhouse) throw new Error(id + ': greenhouse مطلوبة'); }
    else if(d.type === 'water'){ if(!d.systemId) throw new Error(id + ': systemId مطلوبة'); if(!['irrigation', 'drainage', 'tank'].includes(d.source || 'irrigation')) throw new Error(id + ': source غلط'); }
    else throw new Error(id + ': type لازم climate أو water');
  });
  return cfg;
}
/* بيحوّل جسم الطلب لقراءة صالحة أو بيرمي خطأ {status, message} */
function buildEntry(dev, body, nowMs){
  const need = dev.type === 'climate' ? ['temp', 'rh', 'lux'] : ['ph', 'ec', 'temp'];
  const e = {};
  for(const k of need){
    const v = parseFloat(body[k]);
    if(!isFinite(v)) throw {status: 400, message: `القيمة ${k} ناقصة أو مش رقم`};
    if(v < RANGES[k][0] || v > RANGES[k][1]) throw {status: 422, message: `${k}=${v} خارج المدى المنطقي`};
    e[k] = Math.round(v * 100) / 100;
  }
  const c = cairoParts(nowMs);
  return {date: c.date, entry: Object.assign({id: 's' + nowMs.toString(36) + Math.random().toString(36).slice(2, 6), ts: c.ts, note: 'حساس', by: 'sensor:' + (body.device || ''), createdAt: nowMs}, e)};
}
function docFor(dev, date){
  if(dev.type === 'climate') return {id: `climate_${safePart(dev.greenhouse)}_${date}`, extra: {source: 'climate', date, systemId: dev.greenhouse}};
  const src = dev.source || 'irrigation';
  return {id: `${src}_${safePart(dev.systemId)}_${date}`, extra: {source: src, date, systemId: dev.systemId}};
}
/* state: {last: {device: ms}, day: 'YYYY-MM-DD', writes: n} — في الذاكرة */
async function ingest({db, cfg, state, body, now = Date.now()}){
  const dev = cfg.devices[body && body.device];
  if(!dev) throw {status: 404, message: 'جهاز غير معروف'};
  const minMs = (Number(cfg.minIntervalMin) > 0 ? Number(cfg.minIntervalMin) : 10) * 60000, maxDay = Number(cfg.maxWritesPerDay) > 0 ? Number(cfg.maxWritesPerDay) : 400;
  const day = cairoParts(now).date;
  if(state.day !== day){ state.day = day; state.writes = 0; }
  if(state.last[body.device] && now - state.last[body.device] < minMs) return {skipped: 'throttled'};
  if(state.writes >= maxDay) return {skipped: 'daily-cap'};
  const {date, entry} = buildEntry(dev, body, now), d = docFor(dev, date), ref = db.collection('readings').doc(d.id);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref), cur = snap.exists && Array.isArray(snap.data().entries) ? snap.data().entries.slice() : [];
    cur.push(entry); cur.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    tx.set(ref, Object.assign({}, snap.exists ? snap.data() : {}, d.extra, {entries: cur}));
  });
  state.last[body.device] = now; state.writes++;
  return {saved: true, id: d.id, ts: entry.ts};
}
function createServer({db, cfg, apiKey}){
  const state = {last: {}, day: '', writes: 0};
  return http.createServer((req, res) => {
    const send = (code, obj) => { res.writeHead(code, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify(obj)); };
    if(req.method === 'GET' && req.url === '/health') return send(200, {ok: true});
    if(req.method !== 'POST' || req.url !== '/ingest') return send(404, {error: 'not found'});
    if(!apiKey || !keyOk(req.headers['x-api-key'], apiKey)) return send(401, {error: 'unauthorized'});
    let raw = '';
    req.on('data', c => { raw += c; if(raw.length > 4096){ send(413, {error: 'too large'}); req.destroy(); } });
    req.on('end', async () => {
      let body; try{ body = JSON.parse(raw); }catch(e){ return send(400, {error: 'JSON غلط'}); }
      try{ send(200, await ingest({db, cfg, state, body})); }
      catch(e){ if(e && e.status) send(e.status, {error: e.message}); else { console.error(e); send(500, {error: 'server error'}); } }
    });
  });
}
async function main(){
  const admin = require('firebase-admin');
  const cred = process.env.FIREBASE_SERVICE_ACCOUNT ? admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) : admin.credential.applicationDefault();
  admin.initializeApp({credential: cred});
  const cfg = loadConfig(require('fs').readFileSync(process.env.SENSOR_CONFIG || './sensors.config.json', 'utf8'));
  if(!process.env.SENSOR_API_KEY || process.env.SENSOR_API_KEY.length < 16) throw new Error('SENSOR_API_KEY لازم يكون 16 حرف على الأقل');
  const port = Number(process.env.PORT || 8787), host = process.env.HOST || '0.0.0.0';
  createServer({db: admin.firestore(), cfg, apiKey: process.env.SENSOR_API_KEY}).listen(port, host, () => console.log(`بوابة الحساسات شغّالة على ${host}:${port} — ${Object.keys(cfg.devices).length} جهاز`));
}
module.exports = {loadConfig, buildEntry, docFor, ingest, createServer, cairoParts};
if(require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });
