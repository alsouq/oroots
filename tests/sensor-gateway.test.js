const assert = require('assert');
const G = require('../sensors/sensor-gateway.js');
function fakeDb(data){
  return {collection: c => ({doc: id => ({path: c + '/' + id})}),
    runTransaction: async fn => fn({get: async ref => ({exists: ref.path in data, data: () => data[ref.path]}), set: (ref, d) => { data[ref.path] = d; }})};
}
(async () => {
  const cfg = G.loadConfig({minIntervalMin: 10, maxWritesPerDay: 3, devices: {c1: {type:'climate', greenhouse:'LG1'}, w1: {type:'water', source:'drainage', systemId:'S1'}}});
  const data = {}, db = fakeDb(data), state = {last: {}, day: '', writes: 0};
  const T0 = Date.parse('2026-11-06T10:00:00Z');   // 12:00 القاهرة
  let r = await G.ingest({db, cfg, state, body: {device:'c1', temp:26.456, rh:60, lux:3500}, now: T0});
  assert.ok(r.saved && r.id === 'climate_LG1_2026-11-06' && r.ts === '2026-11-06T12:00');
  const doc = data['readings/climate_LG1_2026-11-06'];
  assert.deepStrictEqual([doc.source, doc.systemId, doc.date, doc.entries.length], ['climate', 'LG1', '2026-11-06', 1]);
  assert.strictEqual(doc.entries[0].temp, 26.46); assert.ok(doc.entries[0].id && doc.entries[0].by === 'sensor:c1');
  // تقليل: قراءة بعد 3 دقايق تتجاهل
  r = await G.ingest({db, cfg, state, body: {device:'c1', temp:27, rh:60, lux:3500}, now: T0 + 3*60000}); assert.strictEqual(r.skipped, 'throttled');
  // بعد 11 دقيقة تتسجل وتتضاف لنفس المستند (بترتيب الوقت)
  r = await G.ingest({db, cfg, state, body: {device:'c1', temp:27, rh:58, lux:4000}, now: T0 + 11*60000}); assert.ok(r.saved);
  assert.strictEqual(data['readings/climate_LG1_2026-11-06'].entries.length, 2);
  // مياه/صرف
  r = await G.ingest({db, cfg, state, body: {device:'w1', ph:6.1, ec:2.4, temp:22}, now: T0}); assert.strictEqual(r.id, 'drainage_S1_2026-11-06');
  // حد يومي (3 كتابات)
  r = await G.ingest({db, cfg, state, body: {device:'c1', temp:27, rh:58, lux:4000}, now: T0 + 30*60000}); assert.strictEqual(r.skipped, 'daily-cap');
  // يوم جديد: العداد يتصفّر
  r = await G.ingest({db, cfg, state, body: {device:'c1', temp:20, rh:70, lux:100}, now: T0 + 86400000}); assert.ok(r.saved && r.id === 'climate_LG1_2026-11-07');
  // رفض: جهاز مجهول، قيمة ناقصة، قيمة مستحيلة
  await assert.rejects(G.ingest({db, cfg, state, body: {device:'zz', temp:1}, now: T0}), e => e.status === 404);
  await assert.rejects(G.ingest({db, cfg, state: {last:{}, day:'', writes:0}, body: {device:'c1', temp:26, rh:60}, now: T0}), e => e.status === 400);
  await assert.rejects(G.ingest({db, cfg, state: {last:{}, day:'', writes:0}, body: {device:'c1', temp:26, rh:160, lux:1}, now: T0}), e => e.status === 422);
  assert.throws(() => G.loadConfig({devices: {x: {type:'water'}}}));
  // HTTP: مفتاح غلط = 401، صح = 200
  const srv = G.createServer({db, cfg, apiKey: 'k'.repeat(20)}); await new Promise(res => srv.listen(0, '127.0.0.1', res));
  const port = srv.address().port, post = (key, body) => new Promise(res => { const rq = require('http').request({port, host:'127.0.0.1', method:'POST', path:'/ingest', headers:{'x-api-key': key, 'content-type':'application/json'}}, rs => { let d=''; rs.on('data', c => d+=c); rs.on('end', () => res([rs.statusCode, d])); }); rq.end(JSON.stringify(body)); });
  assert.strictEqual((await post('bad', {device:'c1'}))[0], 401);
  const ok = await post('k'.repeat(20), {device:'w1', ph:6, ec:2, temp:20}); assert.strictEqual(ok[0], 200);
  srv.close();
  console.log('✓ كل الاختبارات نجحت');
})().catch(e => { console.error('✗', e.stack || e); process.exit(1); });
