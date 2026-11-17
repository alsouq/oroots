/* الحفظ من غير نت: القراءات بتتسجّل في طابور على الجهاز، وبتتبعت وتتدمج مع جهاز تاني أول ما النت يرجع،
   وإعادة تحميل الصفحة من غير نت بتفتح آخر بيانات محفوظة، واللي السيرفر يرفضه بيظهر عليه تنبيه. */
const {run, baseSeed, dd} = require('./lib');
const today = dd(0);

run('الحفظ من غير نت', async ({T, startServer, openPage, login, tab, sub, sleep}) => {
  const S = await startServer(baseSeed({users: [{id: 'u2', username: 'ali@farm.com', role: 'employee', displayName: 'Ali', permissions: {water: 'edit'}}]}));
  const DOC = 'readings/tank_S1_' + today;
  const phs = async () => (((await S.doc(DOC)) || {}).entries || []).map(e => e.ph).sort();
  const addReading = (p, ph) => p.evaluate(ph => { const f = document.querySelector('#ws-tank-form'); f.querySelector('#ws-tank-ph').value = String(ph); f.querySelector('#ws-tank-ec').value = '1.9'; f.querySelector('#ws-tank-temp').value = '22'; f.querySelector('button[type=submit]').click(); }, ph);
  const badge = p => p.evaluate(() => (document.querySelector('#sync-text') || {}).textContent || '');
  const note = p => p.evaluate(() => (document.getElementById('lf-sync-note') || {}).textContent || '');

  const A = await openPage(S); await login(A.p, S, 'ali@farm.com');
  const B = await openPage(S); await login(B.p, S, 'boss@farm.com');
  await tab(A.p, 'water');

  // 1) علي يقطع النت ويسجّل قراءتين
  await A.c.setOffline(true); await sleep(500);
  await addReading(A.p, 6.1); await sleep(1200); await addReading(A.p, 6.2); await sleep(1200);
  T.ok(/2/.test(await badge(A.p)) && /نت|offline/i.test(await badge(A.p)), 'الشارة بتقول فيه 2 مستنيين', await badge(A.p));
  await sub(A.p, 'water', 'records');
  const shown = await A.p.evaluate(() => document.body.innerText.match(/6\.[12]/g) || []);
  T.ok(shown.indexOf('6.1') >= 0 && shown.indexOf('6.2') >= 0, 'القراءات ظاهرة عنده قبل ما تتبعت');

  // 2) المدير (أونلاين) يسجّل قراءة في نفس اليوم والنظام
  await tab(B.p, 'water'); await addReading(B.p, 6.7); await sleep(1500);
  T.eq(await phs(), [6.7], 'السيرفر فيه قراءة المدير بس');

  // 3) علي يرجع أونلاين ⇒ تتبعت وتتدمج من غير ما تمسح قراءة المدير
  await A.c.setOffline(false); await sleep(6000);
  T.eq(await phs(), [6.1, 6.2, 6.7], 'اتدمجوا التلاتة على السيرفر');
  T.ok(!/2/.test(await badge(A.p)), 'الشارة اتصفّرت', await badge(A.p));

  // 4) إعادة تحميل الصفحة من غير نت ⇒ مسجّل دخول وبيشوف آخر بيانات
  await A.p.reload(); await sleep(3000); await A.c.setOffline(true); await A.p.reload().catch(() => {}); await sleep(5000);
  T.ok(await A.p.evaluate(() => { const f = document.querySelector('#login-form'); return !f || f.offsetParent === null; }), 'فاتح من غير نت ومش راجع لشاشة الدخول');
  await tab(A.p, 'water').catch(() => {}); await sub(A.p, 'water', 'records');
  const off = await A.p.evaluate(() => document.body.innerText.match(/6\.[127]/g) || []);
  T.ok(['6.1', '6.2', '6.7'].every(x => off.indexOf(x) >= 0), 'القراءات ظاهرة من النسخة المحفوظة', off.slice(0, 6));
  await A.c.setOffline(false); await sleep(3000);

  // 5) حاجة اترفضت: المدير شال صلاحية المياه وعلي من غير نت
  await A.c.setOffline(true); await sub(A.p, 'water', 'entry'); await addReading(A.p, 6.3); await sleep(1500);
  await S.api('boss@farm.com', '/api/db/commit', {writes: [{op: 'set', path: 'roles/ali@farm.com', data: {role: 'employee', perms: {water: 'view'}}}]});
  await A.c.setOffline(false); await sleep(7000);
  T.ok(/ما اتحفظتش|not saved/i.test(await note(A.p)), 'ظهر تنبيه إن فيه حاجة اترفضت', await note(A.p));
  T.eq(await phs(), [6.1, 6.2, 6.7], 'القراءة المرفوضة ما دخلتش السيرفر');
  T.eq(A.errs.concat(B.errs), [], 'مفيش أخطاء في الصفحة');
});
