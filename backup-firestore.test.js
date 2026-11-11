const assert = require('assert');
const B = require('../backup-firestore.js');
function fakeDb(data){
  const written = {};
  const db = {
    written,
    collection: (c) => ({
      orderBy(){ let after = null, lim = Infinity; const q = {limit(n){ lim = n; return q; }, startAfter(d){ after = d; return q; },
        async get(){ let ids = Object.keys(data[c] || {}).sort(); if(after) ids = ids.filter(i => i > after.id); return {docs: ids.slice(0, lim).map(id => ({id, data: () => data[c][id]}))}; }}; return q; },
      doc: (id) => ({coll: c, id})
    }),
    batch: () => { const ops = []; return {set: (ref, d) => ops.push([ref, d]), commit: async () => ops.forEach(([r, d]) => { (written[r.coll] = written[r.coll] || {})[r.id] = d; })}; }
  };
  return db;
}
(async () => {
  const big = {}; for(let i = 0; i < 2500; i++) big['r' + String(i).padStart(5, '0')] = {n: i, entries: [{a: 'ريحان'}]};   // أكتر من صفحتين
  const data = {readings: big, settings: {config: {ph: [5.5, 6.5]}, users: {list: []}}, harvest: {h1: {cropName: 'خس', quantity: 5}}};
  const o = await B.exportAll(fakeDb(data), ['readings', 'settings', 'harvest', 'missing']);
  assert.strictEqual(Object.keys(o.collections.readings).length, 2500, 'بيجيب كل الصفحات');
  assert.strictEqual(B.countDocs(o), 2503);
  assert.deepStrictEqual(o.collections.missing, {});
  const pass = 'كلمة-سر-طويلة-123';
  const buf = B.encrypt(o, pass);
  assert.ok(!buf.toString('latin1').includes('harvest') && !buf.toString('utf8').includes('ريحان'), 'مفيش نص ظاهر');
  assert.deepStrictEqual(B.decrypt(buf, pass).collections.harvest, {h1: {cropName: 'خس', quantity: 5}});
  assert.throws(() => B.decrypt(buf, 'كلمة-سر-غلط-غلط-غلط'), /فشل فك التشفير/);
  assert.throws(() => B.encrypt(o, 'قصيرة'), /12 حرف/);
  const tam = Buffer.from(buf); tam[tam.length - 5] ^= 1; assert.throws(() => B.decrypt(tam, pass), /فشل/);
  assert.throws(() => B.decrypt(Buffer.from('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), pass), /مش نسخة/);
  // استرجاع: تجربة ثم تطبيق
  const db2 = fakeDb({}); let r = await B.restore(db2, o, false);
  assert.strictEqual(r.applied, false); assert.deepStrictEqual(db2.written, {});
  r = await B.restore(db2, B.decrypt(buf, pass), true);
  assert.ok(r.applied && Object.keys(db2.written.readings).length === 2500 && db2.written.harvest.h1.cropName === 'خس');
  console.log('✓ كل الاختبارات نجحت');
})().catch(e => { console.error('✗', e.stack || e); process.exit(1); });
