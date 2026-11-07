/* O'Roots — بيبعت أي إشعار جديد (مهمة جديدة، رش/تسميد، إلغاء...) على موبايل المستلم حتى لو التطبيق مقفول.
   بيشتغل على GitHub Actions كل 5 دقايق (أو أي Node). بيقرا الإشعارات اللي اتعملت في آخر ساعة ولسه ما اتبعتتش،
   وبيبعتها لأجهزة المستلم (مجموعة pushTokens)، وبعدين بيعلّم الإشعار pushedAt عشان ما يتبعتش تاني. */
'use strict';
const APP_URL = process.env.APP_URL || 'https://alsouq.github.io/oroots/';
const LOOKBACK_MS = 1 * 3600 * 1000;   // ساعة بس (الإشعار بيتعلّم pushedAt بعد ما يتبعت) — بيقلّل القراءات اليومية على Firestore
const BAD_TOKEN = /registration-token-not-registered|invalid-registration-token|invalid-argument/;

function buildPush(n, appUrl){
  const body = String(n.body || '') + (n.fromName ? ' — من ' + n.fromName : '');
  return {title: String(n.title || "O'Roots"), body: body.trim(), tag: String(n.id), url: appUrl || APP_URL};
}
/* db: Firestore، messaging: admin.messaging() — متمرّرين من بره عشان نقدر نختبر من غير شبكة */
async function run({db, messaging, now = Date.now(), appUrl = APP_URL}){
  const snap = await db.collection('notifications').where('createdAt', '>', now - LOOKBACK_MS).get();
  const pending = snap.docs.filter(d => { const n = d.data(); return n && n.to && n.id && !n.read && !n.pushedAt; });
  const byUser = new Map();
  pending.forEach(d => { const to = String(d.data().to).toLowerCase(); if(!byUser.has(to)) byUser.set(to, []); byUser.get(to).push(d); });
  const stats = {users: byUser.size, sent: 0, failed: 0, noDevice: 0};
  for(const [email, docs] of byUser){
    const tokSnap = await db.collection('pushTokens').where('email', '==', email).get();
    const tokens = tokSnap.docs.map(d => d.data().token).filter(Boolean);
    for(const d of docs){
      if(tokens.length){
        const res = await messaging.sendEachForMulticast({
          tokens, data: buildPush(d.data(), appUrl),
          webpush: {headers: {Urgency: 'high', TTL: '86400'}}
        });
        stats.sent += res.successCount; stats.failed += res.failureCount;
        await Promise.all(res.responses.map((r, i) => {
          const code = r.error && r.error.code;
          if(code && BAD_TOKEN.test(code)) return db.collection('pushTokens').doc(tokens[i]).delete();
        }));
      } else { stats.noDevice++; }
      await d.ref.update({pushedAt: now});   // نعلّمه حتى لو مفيش جهاز، عشان ما نعيدش المحاولة كل 5 دقايق
    }
  }
  return stats;
}
async function main(){
  const admin = require('firebase-admin');
  admin.initializeApp({credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))});
  const stats = await run({db: admin.firestore(), messaging: admin.messaging()});
  console.log('إشعارات جديدة:', JSON.stringify(stats));
}
module.exports = {buildPush, run};
if(require.main === module) main().catch(e => { console.error(e); process.exit(1); });
