/* إشعارات السيرفر بلغة كل مستخدم (push-i18n.js) */
const assert = require('assert');
const PI = require('../push-i18n.js');
const {run, buildPush} = require('../send-notifications.js');

// قاموس الإنجليزي + ترجمات المدير
const d = PI.makeDict('en', [{ar:'سماد الحديد', en:'Iron fertilizer'}]);
assert(d, 'لازم القاموس الإنجليزي يتحمّل من i18n/en.json');
assert.strictEqual(PI.makeDict('ar', []), null, 'العربي ملوش قاموس');
assert.strictEqual(PI.trText('☀️ ملخص الصبح', d), '☀️ Morning summary');
assert.strictEqual(PI.trText('📦 مخزون منخفض: سماد الحديد', d), '📦 Low stock: Iron fertilizer');
assert.strictEqual(PI.trText('🔥 النهارده: موجة حر (عظمى 38°C)\nنص مش في القاموس خالص xyz', d), '🔥 Today: heat wave (max 38°C)\nنص مش في القاموس خالص xyz', 'كل سطر لوحده، واللي ملوش ترجمة بيفضل');
assert.strictEqual(PI.trText('مهمة', null), 'مهمة', 'من غير قاموس = زي ما هو');
// شكل الإشعار بالإنجليزي
assert.deepStrictEqual(buildPush({id:'a', title:'مهمة جديدة ليك', body:'سماد الحديد', fromName:'Admin'}, 'https://x/', d),
  {title:'New task for you', body:'Iron fertilizer — from Admin', tag:'a', url:'https://x/'});

(async () => {
  // لغة المستخدم من userData، وأي خطأ = عربي
  const docs = {'userData/en@x.com': {lang:'en'}, 'userData/ar@x.com': {lang:'ar'}};
  const db = {doc: (p) => ({get: async () => { if(p === 'userData/boom@x.com') throw new Error('x'); return {exists: p in docs, data: () => docs[p]}; }})};
  const memo = {};
  assert.strictEqual(await PI.langOf(db, 'EN@x.com', memo), 'en');
  assert.strictEqual(await PI.langOf(db, 'ar@x.com', memo), 'ar');
  assert.strictEqual(await PI.langOf(db, 'none@x.com', memo), 'ar');
  assert.strictEqual(await PI.langOf(db, 'boom@x.com', memo), 'ar');

  // تشغيل كامل: نفس الإشعار بيوصل إنجليزي للي لغته EN وعربي للباقي
  const NOW = 1_000_000_000_000;
  const data = {
    notifications: {a: {id:'a', to:'en@x.com', title:'مهمة جديدة ليك', body:'', createdAt:NOW-1000, read:false}, b: {id:'b', to:'ar@x.com', title:'مهمة جديدة ليك', body:'', createdAt:NOW-1000, read:false}},
    pushTokens: {t1:{token:'t1', email:'en@x.com'}, t2:{token:'t2', email:'ar@x.com'}}
  };
  const mk = (coll, id) => ({id, ref:{update: async (p) => Object.assign(data[coll][id], p)}, data: () => data[coll][id]});
  const fdb = {
    collection: (coll) => ({where(f, op, v){ return {get: async () => ({docs: Object.keys(data[coll]).filter(id => { const x = data[coll][id][f]; return op === '>' ? x > v : x === v; }).map(id => mk(coll, id))})}; }, doc: (id) => ({delete: async () => {}})}),
    doc: (p) => ({get: async () => ({exists: p in docs, data: () => docs[p]})})
  };
  const sent = [];
  await run({db:fdb, now:NOW, messaging:{sendEachForMulticast: async (m) => { sent.push(m); return {successCount:1, failureCount:0, responses:[{}]}; }}});
  const byTok = {}; sent.forEach(m => { byTok[m.tokens[0]] = m.data.title; });
  assert.strictEqual(byTok.t1, 'New task for you');
  assert.strictEqual(byTok.t2, 'مهمة جديدة ليك');
  console.log('push-i18n OK');
})().catch(e => { console.error(e); process.exit(1); });
