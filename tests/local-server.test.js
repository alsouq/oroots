/* اختبار السيرفر المحلي: تسجيل الدخول + الصلاحيات + الكتابة/القراءة + المعاملات + التحديث اللحظي + إشعارات Web Push + النسخة الاحتياطية */
process.removeAllListeners('warning');
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto'), zlib = require('zlib');
const {createServer} = require('../server/server.js');
const jobs = require('../server/jobs.js');
const W = require('../server/webpush.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oroots-'));
const ADMIN = 'boss@farm.com';
const cfg = {port: 0, host: '127.0.0.1', dataDir: path.join(tmp, 'data'), publicDir: path.join(tmp, 'public'), backupDir: path.join(tmp, 'backups'), adminEmail: ADMIN, jobs: true, backupHour: 99};
fs.mkdirSync(cfg.publicDir, {recursive: true}); fs.writeFileSync(path.join(cfg.publicDir, 'index.html'), '<h1>ok</h1>');

(async () => {
  const app = createServer(cfg); jobs.start(app);
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const call = async (method, url, body, tok) => {
    const r = await fetch(base + url, {method, headers: Object.assign({'content-type': 'application/json'}, tok ? {authorization: 'Bearer ' + tok} : {}), body: body ? JSON.stringify(body) : undefined});
    return {status: r.status, j: await r.json().catch(() => ({}))};
  };
  const adminPw = fs.readFileSync(path.join(cfg.dataDir, 'first-admin.txt'), 'utf8').split('\n')[1].replace(/.*: /, '').trim();

  // تسجيل الدخول
  assert.strictEqual((await call('POST', '/api/auth/login', {email: ADMIN, password: 'wrong'})).status, 401);
  const A = (await call('POST', '/api/auth/login', {email: ADMIN.toUpperCase(), password: adminPw})).j.token;
  assert(A, 'المدير يدخل بكلمة السر المؤقتة');
  assert.strictEqual((await call('GET', '/api/auth/me', null, A)).j.email, ADMIN);
  assert.strictEqual((await call('POST', '/api/db/get', {path: 'settings/users'})).status, 401, 'من غير دخول ممنوع');

  // المدير بيضيف موظف (حساب + مستند صلاحيات): مياه = تعديل، مكافحة = عرض
  assert.strictEqual((await call('POST', '/api/auth/create', {email: 'ali@farm.com', password: 'secret1'}, A)).status, 200);
  assert.strictEqual((await call('POST', '/api/auth/create', {email: 'ali@farm.com', password: 'secret1'}, A)).j.error, 'auth/email-already-in-use');
  await call('POST', '/api/db/commit', {writes: [{op: 'set', path: 'roles/ali@farm.com', data: {role: 'employee', perms: {water: 'edit', pests: 'view'}}}]}, A);
  const E = (await call('POST', '/api/auth/login', {email: 'ali@farm.com', password: 'secret1'})).j.token;
  assert(E);
  assert.strictEqual((await call('POST', '/api/auth/create', {email: 'x@farm.com', password: 'secret1'}, E)).status, 403, 'الموظف ما يعملش حسابات');

  // ورا Tailscale Funnel: العنوان الحقيقي من X-Forwarded-For — اللي بيخمّن بيتقفل لوحده، والموظف من موبايله يدخل عادي
  const viaProxy = (ip, pw) => fetch(base + '/api/auth/login', {method: 'POST', headers: {'content-type': 'application/json', 'x-forwarded-for': ip}, body: JSON.stringify({email: 'ali@farm.com', password: pw})}).then(r => r.status);
  for(let i = 0; i < 5; i++) assert.strictEqual(await viaProxy('9.9.9.9', 'guess' + i), 401);
  assert.strictEqual(await viaProxy('9.9.9.9', 'secret1'), 429, 'المخمّن اتقفل');
  assert.strictEqual(await viaProxy('41.33.1.2', 'secret1'), 200, 'الموظف الحقيقي من جهاز تاني بيدخل عادي');
  const {clientIp} = require('../server/server.js');
  const fakeReq = (ra, h) => ({socket: {remoteAddress: ra}, headers: h});
  assert.strictEqual(clientIp(fakeReq('192.168.1.20', {'x-forwarded-for': '1.2.3.4'})), '192.168.1.20', 'من الشبكة المحلية الهيدر مش متصدّق');
  assert.strictEqual(clientIp(fakeReq('::ffff:127.0.0.1', {'x-forwarded-for': '5.5.5.5, 6.6.6.6'})), '6.6.6.6');
  assert.strictEqual(clientIp(fakeReq('127.0.0.1', {'cf-connecting-ip': '7.7.7.7', 'x-forwarded-for': '8.8.8.8'})), '7.7.7.7');

  // الصلاحيات (نفس firestore.rules)
  const w = (tok, writes) => call('POST', '/api/db/commit', {writes}, tok);
  assert.strictEqual((await w(E, [{op: 'set', path: 'readings/irrigation_S1_2026-11-17', data: {source: 'irrigation', systemId: 'S1', date: '2026-11-17', entries: [{ts: '2026-11-17T09:00', ph: 6}]}}])).status, 200, 'موظف المياه يسجّل قراءة ري');
  assert.strictEqual((await w(E, [{op: 'set', path: 'readings/climate_LG1_2026-11-17', data: {source: 'climate', systemId: 'LG1', date: '2026-11-17', entries: []}}])).status, 403, 'ملوش صلاحية مناخ');
  assert.strictEqual((await w(E, [{op: 'set', path: 'pestlog/p1', data: {x: 1}}])).status, 403, 'المكافحة عرض بس');
  assert.strictEqual((await w(E, [{op: 'set', path: 'settings/config', data: {ph: [5, 6]}}])).status, 403, 'الإعدادات للمدير');
  assert.strictEqual((await w(E, [{op: 'delete', path: 'readings/irrigation_S1_2026-11-17'}])).status, 403, 'الحذف للمدير');
  // خطة الرش: لصاحب صلاحية الرش/المكافحة بس، والمكلّف يعلّم "اتنفّذ" بس
  assert.strictEqual((await w(E, [{op: 'set', path: 'sprayPlan/s1', data: {product: 'x'}}])).status, 403, 'الموظف اللي ملوش صلاحية رش ما يضيفش رشة');
  assert.strictEqual((await w(A, [{op: 'set', path: 'sprayPlan/s1', data: {product: 'x', date: '2026-11-17', assignedEmail: 'Ali@farm.com', done: false, doneAt: null, doneBy: ''}}])).status, 200);
  assert.strictEqual((await w(E, [{op: 'update', path: 'sprayPlan/s1', data: {done: true, doneAt: 5, doneBy: 'ali@farm.com'}}])).status, 200, 'المكلّف يعلّم إنها اتنفّذت');
  assert.strictEqual((await w(E, [{op: 'update', path: 'sprayPlan/s1', data: {product: 'y'}}])).status, 403, 'المكلّف ما يغيّرش المنتج');
  assert.strictEqual((await w(E, [{op: 'update', path: 'sprayPlan/s1', data: {done: false, doneBy: 'boss@farm.com'}}])).status, 403, 'ما يعلّمش باسم غيره');
  assert.strictEqual((await w(E, [{op: 'delete', path: 'sprayPlan/s1'}])).status, 403, 'ما يمسحش من خطة الرش');
  await call('POST', '/api/auth/create', {email: 'sam@farm.com', password: 'secret1'}, A);
  await w(A, [{op: 'set', path: 'roles/sam@farm.com', data: {role: 'employee', perms: {spray: 'edit'}}},
    {op: 'set', path: 'settings/users', data: {list: [{username: 'boss@farm.com', displayName: 'Boss', role: 'admin'}, {username: 'ali@farm.com', displayName: 'Ali', role: 'employee'}, {username: 'sam@farm.com', displayName: 'Sam', role: 'employee'}]}}]);
  const S = (await call('POST', '/api/auth/login', {email: 'sam@farm.com', password: 'secret1'})).j.token;
  assert.strictEqual((await w(S, [{op: 'set', path: 'sprayPlan/s2', data: {product: 'z'}}])).status, 200, 'صاحب صلاحية الرش يضيف');
  assert.strictEqual((await w(S, [{op: 'delete', path: 'sprayPlan/s2'}])).status, 200, 'ويمسح');

  // المهام: الموظف يخلّص مهمته هو بس، وما يلمسش مهام غيره
  const TP = 'readings/tasks_2026-11-17', task = (id, o) => Object.assign({id, ts: '2026-11-17T00:00', title: 'مهمة ' + id, assignedTo: '', assignedEmail: '', status: 'pending', completedAt: null, createdBy: ADMIN, checklist: []}, o);
  const T0 = [task('t1', {assignedEmail: 'ali@farm.com', assignedTo: 'Ali', checklist: [{t: 'بند', done: false}]}), task('t2', {assignedEmail: 'boss@farm.com', assignedTo: 'Boss'}),
    task('t3', {assignedEmail: 'ali@farm.com', sopTitle: 'رش وتسميد'}), task('t4', {assignedTo: 'ali '})];
  const setTasks = (tok, entries) => w(tok, [{op: 'set', path: TP, data: {source: 'tasks', date: '2026-11-17', entries}}]);
  const edit = (list, id, o) => list.map(t => t.id === id ? Object.assign({}, t, o) : t);
  assert.strictEqual((await setTasks(A, T0)).status, 200);
  let T1 = edit(T0, 't1', {status: 'done', completedAt: 9, checklist: [{t: 'بند', done: true}]});
  assert.strictEqual((await setTasks(E, T1)).status, 200, 'يخلّص مهمته وقايمة الفحص');
  T1 = edit(T1, 't4', {status: 'done', completedAt: 9});
  assert.strictEqual((await setTasks(E, T1)).status, 200, 'مهمة باسمه من غير إيميل');
  assert.strictEqual((await setTasks(E, edit(T1, 't2', {status: 'done'}))).status, 403, 'ما يخلّصش مهمة غيره');
  assert.strictEqual((await setTasks(E, edit(T1, 't1', {title: 'تلاعب'}))).status, 403, 'ما يغيّرش نص مهمته');
  assert.strictEqual((await setTasks(E, edit(T1, 't1', {checklist: [{t: 'بند تاني', done: true}]}))).status, 403, 'ما يغيّرش بنود الفحص');
  assert.strictEqual((await setTasks(E, T1.filter(t => t.id !== 't2'))).status, 403, 'ما يمسحش مهمة');
  assert.strictEqual((await setTasks(E, T1.concat([task('t5', {assignedEmail: 'ali@farm.com', createdBy: 'ali@farm.com'})]))).status, 200, 'يضيف لنفسه (المتكررة)');
  T1 = T1.concat([task('t5', {assignedEmail: 'ali@farm.com', createdBy: 'ali@farm.com'})]);
  assert.strictEqual((await setTasks(E, T1.concat([task('t6', {assignedEmail: 'boss@farm.com', createdBy: 'ali@farm.com'})]))).status, 403, 'ما يضيفش مهام لغيره');
  assert.strictEqual((await setTasks(E, T1.concat([task('t6', {assignedEmail: 'ali@farm.com', createdBy: 'boss@farm.com'})]))).status, 403, 'ولا باسم غيره');
  assert.strictEqual((await w(E, [{op: 'set', path: TP, data: {source: 'tasks', date: '2026-11-18', entries: T1}}])).status, 403, 'ما يغيّرش تاريخ المستند');
  assert.strictEqual((await setTasks(S, T1.filter(t => t.id !== 't3').concat([task('t7', {assignedEmail: 'ali@farm.com', createdBy: 'sam@farm.com', sopTitle: 'رش وتسميد'})]))).status, 200, 'صاحب الرش يشيل مهمة رش ويضيف مهام رش للناس');
  assert.strictEqual((await setTasks(S, T1.filter(t => t.id !== 't3' && t.id !== 't2'))).status, 403, 'بس ما يشيلش مهام تانية');
  assert.strictEqual((await call('POST', '/api/db/get', {path: TP}, A)).j.data.entries.map(t => t.id).join(), 't1,t2,t4,t5,t7');
  assert.strictEqual((await w(E, [{op: 'set', path: 'userData/boss@farm.com', data: {lang: 'en'}}])).status, 403, 'بيانات غيره الخاصة');
  assert.strictEqual((await w(E, [{op: 'set', path: 'userData/ali@farm.com', data: {lang: 'en'}}])).status, 200);
  assert.strictEqual((await w(E, [{op: 'set', path: 'randomColl/x', data: {}}])).status, 403, 'كولكشن مش معروف');
  assert.strictEqual((await call('POST', '/api/db/get', {path: 'roles/boss@farm.com'}, E)).status, 403, 'الموظف ما يقراش صلاحيات غيره');
  assert.strictEqual((await call('POST', '/api/db/get', {path: 'roles/ali@farm.com'}, E)).status, 200);
  // الإشعارات: الموظف يبعت للمدير؛ المستلم بس يقرا ويعلّم مقروء
  await w(A, [{op: 'set', path: 'roles/boss@farm.com', data: {role: 'admin'}}]);
  assert.strictEqual((await w(E, [{op: 'set', path: 'notifications/n1', data: {id: 'n1', from: 'ali@farm.com', to: 'boss@farm.com', title: 'مهمة جديدة ليك', body: '', createdAt: Date.now(), read: false}}])).status, 200);
  assert.strictEqual((await w(E, [{op: 'set', path: 'notifications/n2', data: {id: 'n2', from: 'boss@farm.com', to: 'boss@farm.com', title: 'x'}}])).status, 403, 'ما يبعتش باسم غيره');
  assert.strictEqual((await call('POST', '/api/db/query', {coll: 'notifications'}, E)).j.docs.length, 0, 'ما يشوفش إشعارات غيره');
  assert.strictEqual((await w(A, [{op: 'update', path: 'notifications/n1', data: {read: true, readAt: 1}}])).status, 200);
  assert.strictEqual((await w(A, [{op: 'update', path: 'notifications/n1', data: {title: 'تلاعب'}}])).status, 403, 'المستلم يعلّم مقروء بس');

  // الاستعلامات + القيم الخاصة (increment / merge / update بنقط)
  await w(A, [{op: 'set', path: 'harvest/h1', data: {ts: '2026-11-10T10:00', q: 5, meta: {a: 1, b: 2}}}, {op: 'set', path: 'harvest/h2', data: {ts: '2026-11-12T10:00', q: 7}}, {op: 'set', path: 'harvest/h3', data: {ts: '2026-10-01T10:00', q: 1}}]);
  const q = await call('POST', '/api/db/query', {coll: 'harvest', where: [{f: 'ts', op: '>=', v: '2026-11-01'}], orderBy: [{f: 'ts', dir: 'desc'}], limit: 1}, E);
  assert.deepStrictEqual(q.j.docs.map(d => d.id), ['h2']);
  await w(A, [{op: 'set', path: 'harvest/h1', data: {q: {__fv: 'increment', n: 3}, meta: {b: 9}}, merge: true}, {op: 'update', path: 'harvest/h2', data: {'meta.x': 1, q: {__fv: 'delete'}}}]);
  const h1 = (await call('POST', '/api/db/get', {path: 'harvest/h1'}, A)).j.data, h2 = (await call('POST', '/api/db/get', {path: 'harvest/h2'}, A)).j.data;
  assert.deepStrictEqual(h1, {ts: '2026-11-10T10:00', q: 8, meta: {a: 1, b: 9}});
  assert.deepStrictEqual(h2, {ts: '2026-11-12T10:00', meta: {x: 1}});
  assert.strictEqual((await w(A, [{op: 'update', path: 'harvest/none', data: {a: 1}}])).status, 404);

  // المعاملات: لو المستند اتغيّر بعد ما اتقرا ⇒ 409
  const g = (await call('POST', '/api/db/get', {path: 'settings/pipeMaps'}, A)).j;
  await w(A, [{op: 'set', path: 'settings/pipeMaps', data: {list: [1]}}]);
  assert.strictEqual((await call('POST', '/api/db/commit', {writes: [{op: 'set', path: 'settings/pipeMaps', data: {list: [2]}}], reads: [{path: 'settings/pipeMaps', ver: g.ver}]}, A)).status, 409);

  // التحديث اللحظي: الموظف بيستقبل تغييرات القراءات وما بيستقبلش إشعارات غيره
  const events = [];
  const sseReq = http.get(base + '/api/events?token=' + E, res => { res.setEncoding('utf8'); res.on('data', c => { c.split('\n').filter(l => l.startsWith('data: ')).forEach(l => events.push(...JSON.parse(l.slice(6)))); }); });
  await new Promise(r => setTimeout(r, 200));
  await w(A, [{op: 'set', path: 'readings/tank_S1_2026-11-17', data: {source: 'tank', systemId: 'S1', date: '2026-11-17', entries: []}}, {op: 'set', path: 'notifications/n9', data: {id: 'n9', from: ADMIN, to: ADMIN, title: 'سري', createdAt: Date.now()}}]);
  await new Promise(r => setTimeout(r, 300));
  assert(events.some(e => e.p === 'readings/tank_S1_2026-11-17'), 'وصل تحديث القراءة');
  assert(!events.some(e => e.c === 'notifications'), 'ما وصلوش إشعارات غيره');
  sseReq.destroy();

  // إشعارات الموبايل: جهاز وهمي (endpoint محلي) بيستقبل رسالة مشفّرة صح
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys(); const authSecret = crypto.randomBytes(16);
  const got = [];
  const pushSrv = http.createServer((req, res) => { const ch = []; req.on('data', c => ch.push(c)); req.on('end', () => { got.push({headers: req.headers, body: Buffer.concat(ch)}); res.writeHead(201); res.end(); }); });
  await new Promise(r => pushSrv.listen(0, '127.0.0.1', r));
  const sub = {endpoint: 'http://127.0.0.1:' + pushSrv.address().port + '/push/abc', keys: {p256dh: W.b64u(ua.getPublicKey()), auth: W.b64u(authSecret)}};
  assert.strictEqual((await call('POST', '/api/push/register', {token: 'tokA', subscription: sub}, A)).status, 200);
  await w(A, [{op: 'set', path: 'pushTokens/tokA', data: {token: 'tokA', email: ADMIN}}]);
  await w(E, [{op: 'set', path: 'notifications/n3', data: {id: 'n3', from: 'ali@farm.com', to: ADMIN, title: 'مهمة جديدة ليك', body: 'ري LG1', createdAt: Date.now(), read: false}}]);
  for(let i = 0; i < 40 && got.length < 2; i++) await new Promise(r => setTimeout(r, 150));
  assert.strictEqual(got.length, 2, 'الإشعارين اللي لسه ما اتبعتوش للمدير وصلوا للجهاز (n3 و n9)');
  // فك التشفير (RFC 8291) بنفس خطوات المتصفح
  const hm = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const decode = g => {
    assert(/^vapid t=.+, k=/.test(g.headers.authorization), 'توقيع VAPID');
    const b = g.body, salt = b.subarray(0, 16), idlen = b[20], asPub = b.subarray(21, 21 + idlen), ct = b.subarray(21 + idlen), shared = ua.computeSecret(asPub);
    const ikm = hm(hm(authSecret, shared), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub, Buffer.from([1])])), prk = hm(salt, ikm);
    const cek = hm(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16), nonce = hm(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
    const dc = crypto.createDecipheriv('aes-128-gcm', cek, nonce); dc.setAuthTag(ct.subarray(ct.length - 16));
    const plain = Buffer.concat([dc.update(ct.subarray(0, ct.length - 16)), dc.final()]);
    return JSON.parse(plain.subarray(0, plain.length - 1).toString('utf8'));
  };
  const msgs = got.map(decode), m3 = msgs.filter(m => m.data.tag === 'n3')[0];
  assert(m3, 'رسالة n3 وصلت'); assert.strictEqual(m3.data.title, 'مهمة جديدة ليك'); assert(/ري LG1/.test(m3.data.body));
  assert((await call('POST', '/api/db/get', {path: 'notifications/n3'}, A)).j.data.pushedAt, 'اتعلّم إنه اتبعت');

  // النسخة الاحتياطية
  const file = jobs.backupNow(app);
  const bk = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
  assert.deepStrictEqual(bk.collections.harvest.h1.q, 8);

  // المراقبة: /api/health بيقول لو فيه مشكلة، والمدير بيوصله إشعار مرة واحدة في اليوم
  let hl = await fetch(base + '/api/health'); assert.strictEqual(hl.status, 200); assert.deepStrictEqual((await hl.json()).issues, []);
  app.store.kvSet('backupError', {at: Date.now() + 1, msg: 'ENOSPC: no space left on device'});
  hl = await fetch(base + '/api/health'); assert.strictEqual(hl.status, 503, 'فيه مشكلة ⇒ 503 عشان UptimeRobot ينبّه');
  assert.deepStrictEqual((await hl.json()).issues, ['backup-failed']);
  const sysN = () => app.store.query('notifications', [], [], 0).filter(d => d.data.from === 'system');
  jobs.checkHealth(app); jobs.checkHealth(app);
  assert.strictEqual(sysN().length, 1, 'إشعار واحد للمدير حتى لو الفحص اتكرر');
  assert(/النسخة الاحتياطية فشلت/.test(sysN()[0].data.title) && /ENOSPC/.test(sysN()[0].data.body) && sysN()[0].data.to === ADMIN);
  app.cfg.minFreeMB = 1e12; jobs.checkHealth(app);
  assert.deepStrictEqual(sysN().map(d => d.id.split('-')[1]).sort(), ['backup', 'disk'], 'تنبيه المساحة');
  delete app.cfg.minFreeMB; jobs.backupNow(app);
  hl = await fetch(base + '/api/health'); assert.strictEqual(hl.status, 200, 'نسخة ناجحة بتمسح المشكلة');
  assert.strictEqual(jobs.healthIssues(app, Date.now() + 40 * 3600000)[0].code, 'backup-old', 'مفيش نسخة من 36 ساعة');

  // المدير يعمل كلمة سر مؤقتة للموظف (والجلسات القديمة بتخرج)
  const reset = await call('POST', '/api/auth/reset', {email: 'ali@farm.com'}, A);
  assert(reset.j.tempPassword && reset.j.tempPassword.length >= 8);
  assert.strictEqual((await call('GET', '/api/auth/me', null, E)).status, 401, 'الجلسة القديمة خرجت');
  assert.strictEqual((await call('POST', '/api/auth/reset', {email: 'ali@farm.com'})).j.error, 'auth/local-reset', 'من غير دخول: كلّم المدير');

  // الملفات الثابتة + منع الخروج برّه الفولدر
  assert.strictEqual((await fetch(base + '/')).status, 200);
  // ETag: زيارة تانية من غير تغيير = 304 من غير جسم، والصفحة محمية من العرض جوه صفحة تانية
  { const big = path.join(cfg.publicDir, 'big.js'); fs.writeFileSync(big, 'var x = "' + 'ابجد '.repeat(4000) + '";');
    const r1 = await fetch(base + '/big.js', {headers: {'accept-encoding': 'identity'}}), tag = r1.headers.get('etag'); await r1.text();
    assert(tag && r1.headers.get('x-frame-options') === 'DENY' && /frame-ancestors 'none'/.test(r1.headers.get('content-security-policy')));
    const r2 = await new Promise(ok => http.get(base + '/big.js', {headers: {'if-none-match': tag}}, ok)); assert.strictEqual(r2.statusCode, 304); r2.resume();
    const gz = await new Promise(ok => http.get(base + '/big.js', {headers: {'accept-encoding': 'gzip'}}, ok));
    assert.strictEqual(gz.headers['content-encoding'], 'gzip'); const chunks = []; for await (const c of gz) chunks.push(c);
    const raw = Buffer.concat(chunks); assert(raw.length < 2000, 'مضغوط: ' + raw.length); assert.strictEqual(zlib.gunzipSync(raw).toString(), fs.readFileSync(big, 'utf8'));
    const br = await new Promise(ok => http.get(base + '/big.js', {headers: {'accept-encoding': 'gzip, br'}}, ok)); assert.strictEqual(br.headers['content-encoding'], 'br'); br.resume(); }
  assert.strictEqual((await fetch(base + '/..%2f..%2fetc/passwd')).status !== 200, true);

  pushSrv.close(); app.server.close(); app.store.close();
  console.log('local-server OK');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
