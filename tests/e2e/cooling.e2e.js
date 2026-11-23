/* محاكي التبريد: التاب بيظهر لمن له صلاحية، والإعدادات من الإعدادات للمدير العام بس (من الواجهة ومن السيرفر)،
   والمجسم بيترسم (WebGL) وبيتحكم فيه زرار التشغيل، وبيتفكّ لما تسيب التاب. */
const {run, baseSeed} = require('./lib');

run('محاكي التبريد', async ({T, startServer, openPage, login, tab, sleep}) => {
  const cfg = {greenhouse: 'LG1', layout: 'staged', L: 36, W: 9.6, spans: 3, he: 3.2, hr: 5.2, fpp: 3, arr: 'tri', cap: 40000, th: [{on: 28, off: 26}, {on: 31, off: 29}, {on: 34, off: 32}]};
  const S = await startServer(baseSeed({
    users: [{id: 'u2', username: 'usr@farm.com', role: 'employee', level: 'user', displayName: 'Usr', permissions: {water: 'view', cooling: 'view'}},
            {id: 'u3', username: 'op@farm.com', role: 'employee', level: 'operator', displayName: 'Op', permissions: {water: 'edit'}}],
    settings: {cooling: {list: [cfg]}}
  }));
  const lv = (em, level, perms) => S.api('boss@farm.com', '/api/db/commit', {writes: [{op: 'set', path: 'roles/' + em, data: {role: 'employee', level, perms}}]});
  await lv('usr@farm.com', 'user', {water: 'view', cooling: 'view'});
  await lv('op@farm.com', 'operator', {water: 'edit'});

  // ===== المدير العام: يظبط من الإعدادات =====
  const A = await openPage(S, {viewport: {width: 1200, height: 900}}); await login(A.p, S, 'boss@farm.com');
  await tab(A.p, 'settings'); await sleep(600);
  await A.p.evaluate(() => { const c = document.getElementById('cooling-card'), t = c && c.querySelector('.card-toggle'); if(document.getElementById('cooling-set').offsetParent === null && t) t.click(); }); await sleep(400);
  T.ok(await A.p.$eval('#cooling-card', c => c.style.display !== 'none'), 'كارت محاكي التبريد ظاهر للمدير العام في الإعدادات');
  T.eq(await A.p.$eval('#coo-layout', s => s.value), 'staged', 'الإعداد المحفوظ اتحمّل في النموذج');
  await A.p.selectOption('#coo-layout', 'both'); await sleep(200);
  T.eq(await A.p.$$eval('#coo-ths .coo-th', r => r.filter(x => x.style.display !== 'none').length), 2, 'عدد مراحل التشغيل بيتغيّر مع التصميم');
  await A.p.fill('#coo-spans', '2'); await A.p.fill('#coo-fpp', '2'); await A.p.selectOption('#coo-arr', 'row');
  await A.p.fill('#coo-off0', '30'); await A.p.click('#coo-save'); await sleep(700);   // فصل 30 ≥ تشغيل 28: لازم يترفض
  T.eq((await S.doc('settings/cooling')).list[0].layout, 'staged', 'حرارة فصل أعلى من التشغيل ما اتحفظتش');
  await A.p.fill('#coo-off0', '26'); await A.p.click('#coo-save'); await sleep(1500);
  const saved = (await S.doc('settings/cooling')).list[0];
  T.eq([saved.layout, saved.spans, saved.fpp, saved.arr, saved.greenhouse], ['both', 2, 2, 'row', 'LG1'], 'اتحفظ في settings/cooling');

  // ===== التاب بيرسم المجسم =====
  await tab(A.p, 'cooling'); await sleep(2500);
  T.ok(await A.p.$('#cooling-host canvas') !== null, 'المجسم اتحمّل (canvas)');
  T.ok(/كروت على الجنبين/.test(await A.p.$eval('.cs-lname', e => e.textContent)), 'اسم التصميم المحفوظ بيظهر');
  await A.p.click('#cs-qm [data-m="on"]'); await sleep(1500);
  T.ok(/4\/4/.test(await A.p.$eval('#cs-hudState', e => e.textContent)), 'تشغيل الكل: 4 مراوح من 4 (سبانين × مروحتين)', await A.p.$eval('#cs-hudState', e => e.textContent));
  await A.p.click('#cs-qm [data-m="off"]'); await sleep(1500);
  T.ok(/0\/4/.test(await A.p.$eval('#cs-hudState', e => e.textContent)), 'فصل الكل: صفر مراوح');
  await tab(A.p, 'water'); await sleep(500);
  T.eq(await A.p.$$eval('#cooling-host canvas', x => x.length), 0, 'المجسم اتفكّ لما سبنا التاب');

  // ===== موظف بصلاحية عرض: بيشوف من غير ما يغيّر =====
  const U = await openPage(S, {viewport: {width: 1200, height: 900}}); await login(U.p, S, 'usr@farm.com');
  T.ok(!(await U.p.$eval('.tab-btn[data-tab="cooling"]', b => b.classList.contains('hidden'))), 'التاب ظاهر لمن له صلاحية');
  T.ok(await U.p.$eval('.tab-btn[data-tab="settings"]', b => b.classList.contains('hidden')), 'والإعدادات مخفية عنه');
  await tab(U.p, 'cooling'); await sleep(2500);
  T.ok(await U.p.$('#cooling-host canvas') !== null, 'بيشوف المحاكي');
  const wr = await S.api('usr@farm.com', '/api/db/commit', {writes: [{op: 'set', path: 'settings/cooling', data: {list: []}}]});
  T.eq(wr.status, 403, 'السيرفر بيرفض تعديله للإعدادات');
  T.eq((await S.doc('settings/cooling')).list.length, 1, 'الإعدادات زي ما هي');

  // ===== مشغّل من غير صلاحية: التاب مخفي =====
  const O = await openPage(S, {viewport: {width: 1200, height: 900}}); await login(O.p, S, 'op@farm.com');
  T.ok(await O.p.$eval('.tab-btn[data-tab="cooling"]', b => b.classList.contains('hidden')), 'التاب مخفي عن اللي من غير صلاحية');
  T.eq(A.errs.concat(U.errs, O.errs), [], 'مفيش أخطاء في الصفحة');
});
