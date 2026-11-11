/* اختبار عدّاد استهلاك السكربتات: بيعدّ القراءات/الكتابات ويسجّلها في usageStats */
const assert = require('assert'), U = require('../usage-report.js');
class Query { get(){ return Promise.resolve({size: this.n || 0}); } }
class Doc { get(){ return Promise.resolve({}); } set(){ return Promise.resolve(); } update(){ return Promise.resolve(); } delete(){ return Promise.resolve(); } }
class FS { getAll(...r){ return Promise.resolve(r.map(() => ({}))); } }
(async () => {
  const c = U.install({Query, DocumentReference: Doc, Firestore: FS});
  const q = new Query(); q.n = 5; await q.get();            // ٥ مستندات
  const q0 = new Query(); await q0.get();                    // استعلام فاضي = قراءة واحدة
  const d = new Doc(); await d.get(); await d.set(); await d.update(); await d.delete();
  await new FS().getAll(1, 2, 3);
  assert.strictEqual(c.r, 5 + 1 + 1 + 3, 'reads ' + c.r); assert.strictEqual(c.w, 3, 'writes ' + c.w);
  U.install({Query, DocumentReference: Doc, Firestore: FS}, {r: 0, w: 0});   // تركيب تاني ما يضاعفش العدّ
  await d.get(); assert.strictEqual(c.r, 11);
  const saved = [];
  const db = {collection: n => ({doc: id => ({set: (v, o) => { saved.push({n, id, v, o}); return Promise.resolve(); }})})};
  await U.report(db, {increment: x => ({inc: x})}, 'push-notifications', c);
  assert.strictEqual(saved[0].n, 'usageStats'); assert(/^\d{4}-\d\d-\d\d__github-actions@push-notifications__push-notifications$/.test(saved[0].id), saved[0].id);
  assert.deepStrictEqual(saved[0].v.r, {inc: 11}); assert.deepStrictEqual(saved[0].v.w, {inc: 4}); assert.strictEqual(saved[0].v.user, 'github-actions@push-notifications');
  await U.report({collection(){ throw new Error('x'); }}, {increment: x => x}, 's', c);   // فشل التسجيل ما يرميش
  console.log('usage-report OK');
})().catch(e => { console.error(e); process.exit(1); });
