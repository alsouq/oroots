/* O'Roots — تنبيه المهام كل ساعة (بيشتغل على السيرفر: GitHub Actions أو أي Node)
   بيجيب المهام المعلّقة (النهارده + المتأخرة لحد 14 يوم) لكل موظف، وبيبعتله إشعار على موبايله
   حتى لو التطبيق مقفول، وبيوقف تلقائياً لما كل مهامه تتعلّم "تم". */
'use strict';
const TZ = 'Africa/Cairo';
// ساعات التنبيه بتتظبط من تاب الإعدادات في التطبيق (settings/config)؛ دي القيم الافتراضية لو مفيش إعداد
const DEFAULT_FROM = Number(process.env.REMIND_FROM || 7);
const DEFAULT_TO = Number(process.env.REMIND_TO || 19);
const LOOKBACK = 14;                                    // أيام المهام المتأخرة اللي بتتفكّر
const APP_URL = process.env.APP_URL || 'https://alsouq.github.io/oroots/';

function resolveWindow(cfg){
  let from = Number(cfg && cfg.remindFrom), to = Number(cfg && cfg.remindTo);
  if(!(Number.isInteger(from) && from >= 0 && from <= 23)) from = DEFAULT_FROM;
  if(!(Number.isInteger(to) && to >= 1 && to <= 24 && to > from)) to = Math.min(24, Math.max(DEFAULT_TO, from + 1));
  return {from, to};
}
function cairoNow(d){
  const p = {};
  new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23'})
    .formatToParts(d).forEach(x => { p[x.type] = x.value; });
  return {date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour)};
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

async function main(){
  const admin = require('firebase-admin');
  admin.initializeApp({credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))});
  const db = admin.firestore();
  const now = cairoNow(new Date());
  const cfgSnap = await db.doc('settings/config').get();
  const win = resolveWindow(cfgSnap.exists ? cfgSnap.data() : {});
  if(now.hour < win.from || now.hour >= win.to){ console.log('خارج ساعات التنبيه:', now, win); return; }

  const refs = lastDates(now.date, LOOKBACK).map(d => db.collection('readings').doc('tasks_' + d));
  const snaps = (await db.getAll(...refs)).filter(s => s.exists).map(s => ({id: s.id, data: s.data()}));
  const usersDoc = await db.doc('settings/users').get();
  const per = groupPending(snaps, usersDoc.exists ? usersDoc.data().list : []);
  console.log('موظفين عندهم مهام معلّقة:', per.size);

  for(const [email, list] of per){
    const tokSnap = await db.collection('pushTokens').where('email', '==', email).get();
    const tokens = tokSnap.docs.map(d => d.data().token).filter(Boolean);
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

module.exports = {resolveWindow, cairoNow, lastDates, groupPending, buildMessage};
if(require.main === module) main().catch(e => { console.error(e); process.exit(1); });
