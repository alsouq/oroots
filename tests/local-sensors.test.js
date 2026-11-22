/* الحساسات على السيرفر المحلي: الاستقبال + كلمة السر + الرفض + حالة كل حساس + تنبيه «حساس واقف» */
process.removeAllListeners('warning');
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const {createServer} = require('../server/server.js');
const jobs = require('../server/jobs.js'), sensors = require('../server/sensors.js');
const G = require('../sensors/sensor-gateway.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oroots-sens-'));
const ADMIN = 'boss@farm.com', KEY = 'farm-sensors-key-123456';
const cfg = {port: 0, host: '127.0.0.1', dataDir: path.join(tmp, 'data'), publicDir: path.join(tmp, 'public'), backupDir: path.join(tmp, 'backups'), adminEmail: ADMIN, jobs: false,
  sensors: {apiKey: KEY, port: 0, host: '127.0.0.1', devices: {'lg1-climate': {type: 'climate', greenhouse: 'LG1'}, 's1-tank': {type: 'water', source: 'tank', systemId: 'S1'}}}};
fs.mkdirSync(cfg.publicDir, {recursive: true}); fs.writeFileSync(path.join(cfg.publicDir, 'index.html'), 'ok');

(async () => {
  // إعدادات غلط: من غير كلمة سر / كلمة سر مثال ⇒ ما بيشتغلش وبيقول السبب
  const bad = {store: {kvGet: () => null}, cfg: Object.assign({}, cfg, {sensors: Object.assign({}, cfg.sensors, {apiKey: 'write-a-long-random-key'})}), hooks: {}};
  assert.strictEqual(sensors.start(bad, {listen: false}), null); assert.strictEqual(bad.hooks.sensorsErr, 'apiKey');
  const bad2 = {store: {kvGet: () => null}, cfg: Object.assign({}, cfg, {sensors: {apiKey: KEY, devices: {x: {type: 'climate'}}}}), hooks: {}};
  assert.strictEqual(sensors.start(bad2, {listen: false}), null); assert(/greenhouse/.test(bad2.hooks.sensorsErr));
  assert.strictEqual(sensors.start({store: {}, cfg: {}, hooks: {}}), null, 'مفيش قسم sensors ⇒ مش شغّال ومفيش خطأ');

  const app = createServer(cfg); jobs.start(app);
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const S = sensors.start(app);
  await new Promise(r => S.server.listening ? r() : S.server.once('listening', r));
  const base = 'http://127.0.0.1:' + app.server.address().port, sens = 'http://127.0.0.1:' + S.server.address().port;
  const ingest = (body, key) => fetch(sens + '/ingest', {method: 'POST', headers: {'content-type': 'application/json', 'x-api-key': key === undefined ? KEY : key}, body: JSON.stringify(body)}).then(async r => ({status: r.status, j: await r.json()}));
  const call = async (method, url, body, tok) => { const r = await fetch(base + url, {method, headers: Object.assign({'content-type': 'application/json'}, tok ? {authorization: 'Bearer ' + tok} : {}), body: body ? JSON.stringify(body) : undefined}); return {status: r.status, j: await r.json().catch(() => ({}))}; };

  // قراءة مناخ صح ⇒ بتتسجّل زي القراءة اليدوية وتوصل للمتصفحات المفتوحة
  const changes = []; app.store.onChange(l => l.forEach(c => changes.push(c.path)));
  let r = await ingest({device: 'lg1-climate', temp: 26.44, rh: 61, lux: 3500});
  assert.strictEqual(r.status, 200); assert(r.j.saved);
  const day = G.cairoParts(Date.now()).date, doc = app.store.get('readings/climate_LG1_' + day).data;
  assert.deepStrictEqual([doc.source, doc.systemId, doc.date, doc.entries.length, doc.entries[0].temp, doc.entries[0].by], ['climate', 'LG1', day, 1, 26.44, 'sensor:lg1-climate']);
  assert(changes.indexOf('readings/climate_LG1_' + day) >= 0, 'التحديث اللحظي');
  // قراءة يدوية في نفس المستند وبعدين حساس ⇒ الاتنين موجودين
  app.store.commit([{op: 'set', path: 'readings/climate_LG1_' + day, data: Object.assign({}, doc, {entries: doc.entries.concat([{id: 'manual', ts: day + 'T08:00', temp: 20, rh: 70, lux: 0, by: ADMIN}])})}]);
  assert.strictEqual((await ingest({device: 'lg1-climate', temp: 27, rh: 60, lux: 4000})).j.skipped, 'throttled', 'قبل 10 دقايق بتتجاهل');
  // رفض (حساس pH بايظ بيبعت 19)
  assert.strictEqual((await ingest({device: 's1-tank', ph: 19, ec: 2, temp: 20})).status, 422);
  assert.strictEqual((await ingest({device: 'lg1-climat', temp: 1, rh: 1, lux: 1})).status, 404, 'اسم غلط');
  assert.strictEqual((await ingest({device: 'lg1-climate', temp: 1, rh: 1, lux: 1}, 'wrong-key')).status, 401);
  assert.strictEqual(app.store.get('readings/climate_LG1_' + day).data.entries.length, 2, 'القراءة اليدوية ما اتمسحتش');
  // المعاملة بتتعاد لو المستند اتغيّر في نص الكتابة
  const {adminDb} = require('../server/admin-adapter.js'), db = adminDb(app.store);
  let tries = 0;
  await db.runTransaction(async tx => {
    const snap = await tx.get(db.doc('harvest/t1')); tries++;
    if(tries === 1) app.store.commit([{op: 'set', path: 'harvest/t1', data: {q: 1}}]);   // كتابة تانية في نفس اللحظة
    tx.set(db.doc('harvest/t1'), {q: ((snap.data() || {}).q || 0) + 10});
  });
  assert.deepStrictEqual([tries, app.store.get('harvest/t1').data.q], [2, 11]);

  // حالة الحساسات: للمدير بس
  const pw = fs.readFileSync(path.join(cfg.dataDir, 'first-admin.txt'), 'utf8').split('\n')[1].replace(/.*: /, '').trim();
  const A = (await call('POST', '/api/auth/login', {email: ADMIN, password: pw})).j.token;
  await call('POST', '/api/auth/create', {email: 'ali@farm.com', password: 'secret1'}, A);
  await call('POST', '/api/db/commit', {writes: [{op: 'set', path: 'roles/ali@farm.com', data: {role: 'employee', perms: {}}}]}, A);
  const E = (await call('POST', '/api/auth/login', {email: 'ali@farm.com', password: 'secret1'})).j.token;
  assert.strictEqual((await call('GET', '/api/sensors/status', null, E)).status, 403);
  const st = (await call('GET', '/api/sensors/status', null, A)).j;
  assert.strictEqual(st.enabled, true);
  const c1 = st.devices.filter(d => d.id === 'lg1-climate')[0], t1 = st.devices.filter(d => d.id === 's1-tank')[0];
  assert.deepStrictEqual([c1.greenhouse, c1.values, c1.silent, !!c1.seen], ['LG1', {temp: 26.44, rh: 61, lux: 3500}, false, true]);
  assert(/خارج المدى/.test(t1.error) && !t1.values && !t1.seen, 'آخر خطأ بيبان، والحساس محسوب إنه ما بعتش قراءة صالحة');
  assert.deepStrictEqual(st.unknown.map(u => u.id), ['lg1-climat'], 'جهاز بيبعت باسم مش متسجّل');
  assert(st.badKeyAt > 0 && Array.isArray(st.urls));

  // حساس واقف ⇒ /api/health = 503 وإشعار للمدير (مرة لكل مجموعة حساسات في اليوم)
  assert.strictEqual(sensors.silent(app).length, 0);
  const later = Date.now() + 2 * 3600000;
  assert.deepStrictEqual(sensors.silent(app, later).sort(), ['lg1-climate', 's1-tank']);
  const iss = jobs.healthIssues(app, later).filter(i => i.code === 'sensor-silent')[0];
  assert(iss && /lg1-climate/.test(iss.body) && /60 دقيقة/.test(iss.body));
  jobs.checkHealth(app, later); jobs.checkHealth(app, later);
  const sysN = () => app.store.query('notifications', [], [], 0).filter(d => d.data.from === 'system');
  assert.strictEqual(sysN().length, 1, 'إشعار واحد');
  assert.strictEqual(sysN()[0].data.title, '📡 حساس واقف');
  // التنبيه بالإنجليزي للمدير اللي لغته إنجليزي
  const PI = require('../push-i18n.js'), d = PI.makeDict('en', []);
  assert(!/[؀-ۿ]/.test(PI.trText(iss.title, d) + PI.trText(iss.body, d)), 'ترجمة التنبيه: ' + PI.trText(iss.body, d));

  // 10 محاولات بكلمة سر غلط ⇒ الجهاز يتقفل حتى بالكلمة الصح
  for(let i = 0; i < 9; i++) await ingest({device: 'lg1-climate'}, 'nope');
  assert.strictEqual((await ingest({device: 'lg1-climate', temp: 1, rh: 1, lux: 1})).status, 429);

  S.server.close(); app.server.close(); app.store.close();
  console.log('local-sensors OK');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
