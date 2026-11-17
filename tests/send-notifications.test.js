const assert = require('assert');
const {run, buildPush} = require('../send-notifications.js');
// Firestore وهمي بسيط: collection().where().get() + doc().delete() + ref.update()
function fakeDb(data){
  const mk = (coll, id) => ({id, ref:{update: async (p) => Object.assign(data[coll][id], p), delete: async () => { delete data[coll][id]; }}, data: () => data[coll][id]});
  return {
    collection: (coll) => ({
      where(f, op, v){ return {get: async () => ({docs: Object.keys(data[coll]).filter(id => { const x = data[coll][id][f]; return op === '>' ? x > v : x === v; }).map(id => mk(coll, id))})}; },
      doc: (id) => ({delete: async () => { delete data[coll][id]; }})
    })
  };
}
(async () => {
  const NOW = 1_000_000_000_000;
  const data = {
    notifications: {
      a: {id:'a', to:'ali@x.com', title:'مهمة جديدة ليك', body:'ري LG1', fromName:'المدير', createdAt: NOW-60_000, read:false},
      b: {id:'b', to:'ali@x.com', title:'تانية', body:'', createdAt: NOW-120_000, read:false},
      c: {id:'c', to:'ali@x.com', title:'اتبعتت قبل كده', createdAt: NOW-60_000, read:false, pushedAt: NOW-30_000},
      d: {id:'d', to:'ali@x.com', title:'مقروءة', createdAt: NOW-60_000, read:true},
      e: {id:'e', to:'ali@x.com', title:'قديمة (أكتر من 6 ساعات)', createdAt: NOW-7*3600*1000, read:false},
      f: {id:'f', to:'omar@x.com', title:'مفيش عنده جهاز', createdAt: NOW-1000, read:false},
    },
    pushTokens: {t1:{token:'t1', email:'ali@x.com'}, t2:{token:'t2', email:'ali@x.com', remind:false}, tBad:{token:'tBad', email:'ali@x.com'}}
  };
  const sent = [];
  const messaging = {sendEachForMulticast: async (m) => { sent.push(m); return {successCount: m.tokens.filter(t=>t!=='tBad').length, failureCount: m.tokens.includes('tBad')?1:0,
    responses: m.tokens.map(t => t==='tBad' ? {error:{code:'messaging/registration-token-not-registered'}} : {})}; }};
  const s = await run({db: fakeDb(data), messaging, now: NOW});
  assert.deepStrictEqual(sent.map(m => m.data.tag).sort(), ['a','b'], 'بيبعت الجديدة غير المقروءة وغير المبعوتة بس');
  assert.deepStrictEqual(sent[0].tokens.sort(), ['t1','t2','tBad'], 'كل أجهزة المستلم (حتى اللي قافل تذكير المهام)');
  assert.ok(data.notifications.a.pushedAt && data.notifications.b.pushedAt && data.notifications.f.pushedAt, 'بيعلّم pushedAt');
  assert.ok(!data.notifications.e.pushedAt && !data.notifications.d.pushedAt, 'مبيلمسش القديم والمقروء');
  assert.ok(!data.pushTokens.tBad, 'بيمسح الجهاز الميت');
  assert.deepStrictEqual(s, {users:2, sent:4, failed:2, noDevice:1}); // a,b × (t1,t2 ناجح) ، tBad فاشل
  // تشغيل تاني: مفيش حاجة تتبعت (من غير تكرار)
  sent.length = 0; const s2 = await run({db: fakeDb(data), messaging, now: NOW+1000});
  assert.strictEqual(sent.length, 0); assert.strictEqual(s2.users, 0);
  // شكل الرسالة
  const m = buildPush({id:'a', title:'مهمة', body:'ري', fromName:'المدير'}, 'https://x/'); assert.deepStrictEqual(m, {title:'مهمة', body:'ري — من المدير', tag:'a', url:'https://x/'});
  console.log('✓ كل الاختبارات نجحت', JSON.stringify(s));
})().catch(e => { console.error('✗', e.message); process.exit(1); });
