/* O'Roots — تنبيه المهام كل ساعة (بيشتغل على السيرفر: GitHub Actions أو أي Node)
   بيجيب المهام المعلّقة (النهارده + المتأخرة لحد 14 يوم) لكل موظف، وبيبعتله إشعار على موبايله
   حتى لو التطبيق مقفول، وبيوقف تلقائياً لما كل مهامه تتعلّم "تم". */
'use strict';
const TZ = 'Africa/Cairo';
// ساعات التنبيه بتتظبط من تاب الإعدادات في التطبيق (settings/config)؛ دي القيم الافتراضية لو مفيش إعداد
const DEFAULT_FROM = Number(process.env.REMIND_FROM || 7);
const DEFAULT_TO = Number(process.env.REMIND_TO || 19);
const LOOKBACK = 14;                                    // أيام المهام المتأخرة اللي بتتفكّر
const FL = require('./farm-logic.js');
const APP_URL = process.env.APP_URL || 'https://alsouq.github.io/oroots/';

function resolveWindow(cfg){
  let from = Number(cfg && cfg.remindFrom), to = Number(cfg && cfg.remindTo);
  if(!(Number.isInteger(from) && from >= 0 && from <= 23)) from = DEFAULT_FROM;
  if(!(Number.isInteger(to) && to >= 1 && to <= 24 && to > from)) to = Math.min(24, Math.max(DEFAULT_TO, from + 1));
  return {from, to};
}
function cairoNow(d){
  const p = {};
  new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'})
    .formatToParts(d).forEach(x => { p[x.type] = x.value; });
  return {date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), ts: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`};
}
function lastDates(today, n){
  const base = new Date(today + 'T12:00:00Z'), out = [];
  for(let i = 0; i <= n; i++){ out.push(new Date(base.getTime() - i*86400000).toISOString().slice(0,10)); }
  return out;
}
/* snaps: [{id, data}] — مستندات readings بتاعة المهام؛ users: قايمة settings/users */
function groupPending(snaps, users){
  const byName = new Map();
  (users || []).forEach(u => { if(u && u.displayName && u.username) byName.set(String(u.displayName).trim().toLowerCase(), String(u.username).toLowerCase()); });
  const per = new Map();
  snaps.forEach(s => {
    const date = (s.data && s.data.date) || String(s.id).replace('tasks_', '');
    ((s.data && s.data.entries) || []).forEach(t => {
      if(!t || t.status !== 'pending') return;
      let email = String(t.assignedEmail || '').trim().toLowerCase();
      if(!email && t.assignedTo) email = byName.get(String(t.assignedTo).trim().toLowerCase()) || '';
      if(!email) return;
      if(!per.has(email)) per.set(email, []);
      per.get(email).push({title: t.title || 'مهمة', date});
    });
  });
  return per;
}
function buildMessage(list, today){
  const title = list.length === 1 ? '⏰ عندك مهمة لسه ما خلصتهاش' : `⏰ عندك ${list.length} مهام لسه ما خلصتهاش`;
  const lines = list.slice(0, 3).map(t => '• ' + t.title + (t.date < today ? ' (متأخرة)' : ''));
  const body = lines.join('\n') + (list.length > 3 ? `\n+${list.length - 3} تانية` : '') + '\nافتح التطبيق واضغط "تم ✓" عشان التنبيه يقف.';
  return {title, body};
}


/* ===== تنبيهات يومية إضافية: القراءات الناقصة + ملخص الصبح + مخزون منخفض + انحراف الصرف عن الري ===== */
const DEFAULT_DIGEST_HOUR = 7, DEFAULT_CHECK_HOUR = 11, DEFAULT_EC_DRIFT = 0.6, DEFAULT_PH_DRIFT = 0.8;
const safePart = s => String(s).replace(/\//g, '-').slice(0, 300);
const rid = (source, id, date) => id ? `${source}_${safePart(id)}_${date}` : `${source}_${date}`;
function hourOr(v, def){ v = Number(v); return (Number.isInteger(v) && v >= 0 && v <= 23) ? v : def; }
function numOr(v, def){ v = parseFloat(v); return (isFinite(v) && v > 0) ? v : def; }
function dayBefore(date){ return new Date(new Date(date + 'T12:00:00Z').getTime() - 86400000).toISOString().slice(0, 10); }
function isFruit(sys){ return sys && sys.gtype === 'fruit'; }
/* المطلوب تسجيله يوميًا: ثمريات ← تربة، ورقيات ← ري، وكل صوبة ← مناخ */
function expectedTargets(systems){
  const out = [], ghs = new Set();
  (systems || []).forEach(sy => {
    if(!sy || !sy.id) return;
    const label = (sy.greenhouse ? sy.greenhouse + ' — ' : '') + (sy.name || sy.id);
    if(isFruit(sy)) out.push({kind: 'soil', source: 'soil', id: sy.id, label, tab: 'soil'});
    else out.push({kind: 'water', source: 'irrigation', id: sy.id, label, tab: 'water'});
    if(sy.greenhouse) ghs.add(sy.greenhouse);
  });
  ghs.forEach(g => out.push({kind: 'climate', source: 'climate', id: g, label: g + ' (مناخ)', tab: 'climate'}));
  return out;
}
function canEditTab(u, tab){
  if(!u) return false;
  if(u.role === 'admin') return true;
  const p = u.permissions || {};
  let v = p[tab];
  if(v === undefined && tab === 'soil') v = p.water;
  return v === 'edit';
}
function recipientsFor(users, tab){
  return (users || []).filter(u => u && u.username && canEditTab(u, tab)).map(u => String(u.username).toLowerCase());
}
/* snapsById: Map(id → data|null) — مستندات القراءات الموجودة النهارده */
function findMissing(targets, snapsById, date){
  return targets.filter(t => {
    const d = snapsById.get(rid(t.source, t.kind === 'climate' ? t.id : t.id, date));
    return !(d && Array.isArray(d.entries) && d.entries.length);
  });
}
function lastEntry(doc){ const e = doc && Array.isArray(doc.entries) ? doc.entries.slice().sort((a, b) => String(a.ts).localeCompare(String(b.ts))) : []; return e.length ? e[e.length - 1] : null; }
const MET = {ph: 'pH', ec: 'EC', temp: 'حرارة المياه'};
/* خارج المدى + انحراف الصرف عن الري (للأنظمة الورقية) */
function waterIssues(systems, docs, cfg, today){
  const out = [], ecD = numOr(cfg && cfg.ecDrift, DEFAULT_EC_DRIFT), phD = numOr(cfg && cfg.phDrift, DEFAULT_PH_DRIFT), yest = dayBefore(today);
  (systems || []).forEach(sy => {
    if(!sy || !sy.id || isFruit(sy)) return;
    const label = (sy.greenhouse ? sy.greenhouse + ' — ' : '') + (sy.name || sy.id);
    const pick = src => lastEntry(docs.get(rid(src, sy.id, today))) || lastEntry(docs.get(rid(src, sy.id, yest)));
    const irr = pick('irrigation'), dra = pick('drainage');
    if(irr) ['ph', 'ec', 'temp'].forEach(k => {
      const r = cfg && cfg[k], v = parseFloat(irr[k]);
      if(Array.isArray(r) && isFinite(v) && (v < r[0] || v > r[1])) out.push(`${label}: ${MET[k]} الري ${v} خارج المدى (${r[0]}–${r[1]})`);
    });
    if(irr && dra){
      const dEc = parseFloat(dra.ec) - parseFloat(irr.ec), dPh = parseFloat(dra.ph) - parseFloat(irr.ph);
      if(isFinite(dEc) && Math.abs(dEc) >= ecD) out.push(`${label}: EC الصرف ${dEc > 0 ? 'أعلى' : 'أقل'} من الري بـ ${Math.abs(dEc).toFixed(2)}`);
      if(isFinite(dPh) && Math.abs(dPh) >= phD) out.push(`${label}: pH الصرف ${dPh > 0 ? 'أعلى' : 'أقل'} من الري بـ ${Math.abs(dPh).toFixed(2)}`);
    }
  });
  return out;
}
/* تنبيهات الطقس (نفس منطق التطبيق): daily = {time[], temperature_2m_max[], temperature_2m_min[], wind_speed_10m_max[], precipitation_sum[], precipitation_probability_max[]} */
function weatherAlerts(daily, cfg){
  if(!daily || !Array.isArray(daily.time)) return [];
  const num = (v, d) => { v = parseFloat(v); return isFinite(v) ? v : d; };
  const heat = num(cfg && cfg.wxHeat, 38), cold = num(cfg && cfg.wxCold, 6), wind = num(cfg && cfg.wxWind, 14), out = [];
  daily.time.slice(0, 3).forEach((date, i) => {
    const when = i === 0 ? 'النهارده' : (i === 1 ? 'بكرة' : date), g = k => (daily[k] || [])[i];
    if(g('temperature_2m_max') >= heat) out.push(`🔥 ${when}: موجة حر (عظمى ${Math.round(g('temperature_2m_max'))}°C)`);
    if(g('temperature_2m_min') <= cold) out.push(`🥶 ${when}: برد (صغرى ${Math.round(g('temperature_2m_min'))}°C)`);
    if(g('wind_speed_10m_max') >= wind) out.push(`💨 ${when}: رياح شديدة (${Math.round(g('wind_speed_10m_max') * 3.6)} كم/س)`);
    const rain = g('precipitation_sum'), pp = g('precipitation_probability_max');
    if(rain >= 3 && (pp == null || pp >= 60)) out.push(`🌧️ ${when}: مطر متوقع (${Math.round(rain * 10) / 10} مم)`);
  });
  return out;
}
async function fetchWeather(cfg, fetchJson){
  const lat = parseFloat(cfg.weatherLat), lon = parseFloat(cfg.weatherLon);
  if(!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) || cfg.weatherLat === '' || cfg.weatherLon === '') return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&wind_speed_unit=ms&forecast_days=3&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_sum,precipitation_probability_max`;
  try{ return (await fetchJson(url)).daily || null; }catch(e){ console.error('الطقس:', e.message); return null; }
}
/* مخاطر الأمراض + القراءات الشاذة من قراءات آخر 5 أيام. docs: Map(id → data). بيرجّع [{tab, text}] */
function farmInsights(systems, docs, today, nowTs, cfg){
  const out = [], nowMs = FL.lgTs(nowTs), days = [0, 1, 2, 3, 4].map(i => { let d = today; for(let k = 0; k < i; k++) d = dayBefore(d); return d; });
  const entriesOf = (src, id) => { const all = []; days.forEach(d => { const x = docs.get(rid(src, id, d)); if(x && Array.isArray(x.entries)) all.push(...x.entries); }); return all; };
  const ghs = new Set();
  (systems || []).forEach(sy => {
    if(!sy || !sy.id) return;
    const label = (sy.greenhouse ? sy.greenhouse + ' — ' : '') + (sy.name || sy.id);
    if(sy.greenhouse) ghs.add(sy.greenhouse);
    if(isFruit(sy)) FL.lgAnomalies(entriesOf('soil', sy.id), ['ph', 'ec', 'temp', 'moist'], nowMs).forEach(a => out.push({tab: 'soil', text: `🔎 ${label} (تربة): ${a.text}`}));
    else [['irrigation', 'ري'], ['drainage', 'صرف']].forEach(([src, nm]) => FL.lgAnomalies(entriesOf(src, sy.id), ['ph', 'ec', 'temp'], nowMs).forEach(a => out.push({tab: 'water', text: `🔎 ${label} (${nm}): ${a.text}`})));
  });
  ghs.forEach(g => {
    const ce = entriesOf('climate', g);
    FL.lgDiseaseRisks(ce, nowMs, cfg && cfg.disease).forEach(r => out.push({tab: 'climate', text: `🍄 ${g}: خطر ${r.name} (${r.level === 'high' ? 'عالي' : 'متوسط'} — ${r.hours} ساعة)`}));
    FL.lgAnomalies(ce, ['temp', 'rh'], nowMs).forEach(a => out.push({tab: 'climate', text: `🔎 ${g} (مناخ): ${a.text}`}));
  });
  return out;
}
function lowStock(items){
  return (items || []).filter(i => i && i.minQty !== undefined && i.minQty !== null && i.minQty !== '' && i.quantity !== undefined && i.quantity !== null && i.quantity !== '' && parseFloat(i.quantity) <= parseFloat(i.minQty))
    .map(i => `${i.name || 'صنف'} (${i.quantity}${i.unit ? ' ' + i.unit : ''} ≤ ${i.minQty})`);
}
function digestFor(email, user, ctx){
  const lines = [], isAdmin = user && user.role === 'admin';
  (ctx.weather || []).slice(0, 3).forEach(l => lines.push(l));
  (ctx.insights || []).filter(x => isAdmin || canEditTab(user, x.tab)).slice(0, 4).forEach(x => lines.push(x.text));
  if(isAdmin || canEditTab(user, 'water')) ctx.water.slice(0, 4).forEach(l => lines.push('💧 ' + l));
  if(isAdmin || canEditTab(user, 'inventory')) ctx.stock.slice(0, 3).forEach(l => lines.push('📦 مخزون منخفض: ' + l));
  const t = (ctx.tasks.get(email) || []), late = t.filter(x => x.date < ctx.today).length;
  if(t.length) lines.push(`📋 مهام معلّقة: ${t.length}${late ? ' (متأخرة ' + late + ')' : ''}`);
  return lines;
}
async function pushTo({db, messaging, email, title, body, tag, url}){
  const tokSnap = await db.collection('pushTokens').where('email', '==', email).get();
  const tokens = tokSnap.docs.map(d => d.data()).filter(t => t.token).map(t => t.token);
  if(!tokens.length) return 0;
  const res = await messaging.sendEachForMulticast({tokens, data: {title, body, tag, url: url || APP_URL}, webpush: {headers: {Urgency: 'high', TTL: '43200'}}});
  await Promise.all(res.responses.map((r, i) => {
    const code = r.error && r.error.code;
    if(code && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code)) return db.collection('pushTokens').doc(tokens[i]).delete();
  }));
  return res.successCount;
}
/* بيشتغل كل ساعة: لو جه ميعاد الملخص أو فحص القراءات ولسه ما اتعملش النهارده، بينفّذه مرة واحدة */
async function runDaily({db, messaging, now, cfg, fetchJson = async u => (await fetch(u)).json()}){
  const out = {digest: 0, missing: 0};
  const stDoc = await db.doc('settings/reminderState').get(), st = stDoc.exists ? stDoc.data() : {};
  const wantDigest = cfg.digestOn !== false && now.hour >= hourOr(cfg.digestHour, DEFAULT_DIGEST_HOUR) && st.digestDate !== now.date;
  const wantCheck = cfg.checkOn !== false && now.hour >= hourOr(cfg.checkHour, DEFAULT_CHECK_HOUR) && st.missingDate !== now.date;
  if(!wantDigest && !wantCheck) return out;
  const sysDoc = await db.doc('settings/systems').get(), usersDoc = await db.doc('settings/users').get();
  const systems = sysDoc.exists ? (sysDoc.data().list || []) : [], users = usersDoc.exists ? (usersDoc.data().list || []) : [];
  const yest = dayBefore(now.date), targets = expectedTargets(systems);
  const ids = new Set();
  targets.forEach(t => ids.add(rid(t.source, t.id, now.date)));
  if(wantDigest){
    const ds = [now.date]; for(let i = 1; i < 5; i++) ds.push(dayBefore(ds[ds.length - 1]));
    const ghs = new Set();
    systems.forEach(sy => { if(!sy || !sy.id) return; if(sy.greenhouse) ghs.add(sy.greenhouse); (isFruit(sy) ? ['soil'] : ['irrigation', 'drainage']).forEach(src => ds.forEach(d => ids.add(rid(src, sy.id, d)))); });
    ghs.forEach(g => ds.forEach(d => ids.add(rid('climate', g, d))));
  }
  const refs = [...ids].map(i => db.collection('readings').doc(i));
  const snaps = refs.length ? await db.getAll(...refs) : [];
  const docs = new Map(); snaps.forEach(s => docs.set(s.id, s.exists ? s.data() : null));
  const write = {};
  if(wantCheck){
    const miss = findMissing(targets, docs, now.date), byUser = new Map();
    miss.forEach(t => recipientsFor(users, t.tab).forEach(e => { if(!byUser.has(e)) byUser.set(e, []); byUser.get(e).push(t.label); }));
    for(const [email, list] of byUser){
      const body = list.slice(0, 5).map(x => '• ' + x).join('\n') + (list.length > 5 ? `\n+${list.length - 5} تانية` : '');
      out.missing += await pushTo({db, messaging, email, title: `📝 لسه ما اتسجلتش قراءات النهارده (${list.length})`, body, tag: 'oroots-missing'});
    }
    write.missingDate = now.date;
  }
  if(wantDigest){
    const invSnap = await db.collection('inventory').get();
    const weather = weatherAlerts(await fetchWeather(cfg, fetchJson), cfg);
    const ctxBase = {today: now.date, weather, insights: farmInsights(systems, docs, now.date, now.ts || (now.date + 'T' + String(now.hour).padStart(2, '0') + ':00'), cfg), water: waterIssues(systems, docs, cfg, now.date), stock: lowStock(invSnap.docs.map(d => d.data()))};
    const tdocs = (await db.getAll(...lastDates(now.date, LOOKBACK).map(d => db.collection('readings').doc('tasks_' + d)))).filter(s => s.exists).map(s => ({id: s.id, data: s.data()}));
    const tasks = groupPending(tdocs, users);
    for(const u of users){
      if(!u || !u.username) continue;
      const email = String(u.username).toLowerCase(), lines = digestFor(email, u, {...ctxBase, tasks});
      if(!lines.length) continue;
      const extra = lines.length > 8 ? `\n+${lines.length - 8} تانية` : '';
      out.digest += await pushTo({db, messaging, email, title: '☀️ ملخص الصبح', body: lines.slice(0, 8).join('\n') + extra, tag: 'oroots-digest'});
    }
    write.digestDate = now.date;
  }
  await db.doc('settings/reminderState').set(write, {merge: true});
  return out;
}

async function main(){
  const admin = require('firebase-admin');
  admin.initializeApp({credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))});
  const db = admin.firestore();
  const now = cairoNow(new Date());
  const cfgSnap = await db.doc('settings/config').get();
  const cfg = cfgSnap.exists ? cfgSnap.data() : {};
  try{ const r = await runDaily({db, messaging: admin.messaging(), now, cfg}); console.log('تنبيهات يومية:', r); }
  catch(e){ console.error('تنبيهات يومية فشلت (مش بتوقف تذكير المهام):', e.message); }
  const win = resolveWindow(cfg);
  if(now.hour < win.from || now.hour >= win.to){ console.log('خارج ساعات التنبيه:', now, win); return; }
  const refs = lastDates(now.date, LOOKBACK).map(d => db.collection('readings').doc('tasks_' + d));
  const snaps = (await db.getAll(...refs)).filter(s => s.exists).map(s => ({id: s.id, data: s.data()}));
  const usersDoc = await db.doc('settings/users').get();
  const per = groupPending(snaps, usersDoc.exists ? usersDoc.data().list : []);
  console.log('موظفين عندهم مهام معلّقة:', per.size);

  for(const [email, list] of per){
    const tokSnap = await db.collection('pushTokens').where('email', '==', email).get();
    // remind:false = الموظف قفل تذكير المهام (لسه بيستقبل الإشعارات العادية). الأجهزة القديمة من غير الحقل ده بتتعامل كأنها شغّالة
    const tokens = tokSnap.docs.map(d => d.data()).filter(t => t.token && t.remind !== false).map(t => t.token);
    if(!tokens.length){ console.log('مفيش جهاز مسجّل لـ', email); continue; }
    const m = buildMessage(list, now.date);
    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      data: {title: m.title, body: m.body, tag: 'oroots-tasks', url: APP_URL},
      webpush: {headers: {Urgency: 'high', TTL: '3300'}}
    });
    console.log(email, '→', res.successCount, 'نجح،', res.failureCount, 'فشل');
    await Promise.all(res.responses.map((r, i) => {
      const code = r.error && r.error.code;
      if(code && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code)) return db.collection('pushTokens').doc(tokens[i]).delete();
    }));
  }
}

module.exports = {farmInsights, resolveWindow, cairoNow, lastDates, groupPending, buildMessage, weatherAlerts, expectedTargets, findMissing, waterIssues, lowStock, digestFor, runDaily, recipientsFor, canEditTab, rid};
if(require.main === module) main().catch(e => { console.error(e); process.exit(1); });
