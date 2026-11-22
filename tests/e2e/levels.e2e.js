/* المستويات (مشغّل / مستخدم / مشرف / مدير عام) والملاحظات على السجلات في المتصفح:
   اختيار المستوى بيملا الصلاحيات، المستخدم ما يمسحش، المشرف يمسح، التكاليف والأوردرات للمشرف، وأي حد له عرض يكتب ملاحظة. */
const {run, baseSeed, dd} = require('./lib');
const today = dd(0);

run('مستويات الصلاحيات والملاحظات', async ({T, startServer, openPage, login, tab, sub, sleep, toastText}) => {
  const hv = (id, by) => ({id, ts: today + 'T09:00', cropName: 'ريحان إيطالي', quantity: 10, unit: 'kg', pipes: 5, systemId: 'S1', by, createdAt: Date.now()});
  const S = await startServer(baseSeed({
    users: [{id: 'u2', username: 'usr@farm.com', role: 'employee', level: 'user', displayName: 'Usr', permissions: {harvest: 'edit', quality: 'edit', inventory: 'view', water: 'view'}},
            {id: 'u3', username: 'sup@farm.com', role: 'employee', level: 'supervisor', displayName: 'Sup', permissions: {harvest: 'edit', quality: 'edit', inventory: 'edit', water: 'edit'}},
            {id: 'u4', username: 'vw@farm.com', role: 'employee', level: 'operator', displayName: 'Vw', permissions: {harvest: 'view'}}],
    collections: {harvest: {h1: hv('h1', 'usr@farm.com'), h2: hv('h2', 'boss@farm.com')}}
  }));
  // roles: المستوى لازم يتخزّن في مستند الصلاحيات (السيرفر بيقراه)
  const lv = async (em, level, perms) => S.api('boss@farm.com', '/api/db/commit', {writes: [{op: 'set', path: 'roles/' + em, data: {role: 'employee', level, perms}}]});
  await lv('usr@farm.com', 'user', {harvest: 'edit', quality: 'edit', inventory: 'view', water: 'view'});
  await lv('sup@farm.com', 'supervisor', {harvest: 'edit', quality: 'edit', inventory: 'edit', water: 'edit'});
  await lv('vw@farm.com', 'operator', {harvest: 'view'});

  // ===== المدير: اختيار المستوى بيملا الصلاحيات =====
  const A = await openPage(S, {viewport: {width: 1100, height: 900}}); await login(A.p, S, 'boss@farm.com');
  await tab(A.p, 'settings'); await sleep(600);
  await A.p.evaluate(() => { const c = document.getElementById('users-list').closest('.settings-card'), t = c && c.querySelector('.card-toggle'); if(t && document.getElementById('users-list').offsetParent === null) t.click(); }); await sleep(400);
  await A.p.evaluate(() => { const b = document.querySelector('#users-list .user-edit-btn'); if(b) b.click(); }); await sleep(400);
  await A.p.selectOption('#user-level', 'operator'); await sleep(200);
  const op = await A.p.$$eval('.user-perm-select', ss => Object.fromEntries(ss.map(s => [s.getAttribute('data-tab'), s.value])));
  T.eq([op.water, op.harvest, op.nursery, op.quality, op.inventory, op.ai], ['edit', 'edit', 'edit', 'none', 'none', 'none'], 'مستوى «مشغّل» بيملا تابات التشغيل بس');
  await A.p.selectOption('#user-level', 'supervisor'); await sleep(200);
  const sp = await A.p.$$eval('.user-perm-select', ss => Object.fromEntries(ss.map(s => [s.getAttribute('data-tab'), s.value])));
  T.eq([sp.water, sp.inventory, sp.quality, sp.ai], ['edit', 'edit', 'edit', 'view'], 'مستوى «مشرف»: تعديل الكل والمحلّل عرض');
  await A.p.selectOption('#user-level', 'user'); await sleep(200);
  const us = await A.p.$$eval('.user-perm-select', ss => Object.fromEntries(ss.map(s => [s.getAttribute('data-tab'), s.value])));
  T.eq([us.water, us.nutrients, us.inventory, us.ai], ['edit', 'view', 'view', 'none'], 'مستوى «مستخدم»');
  T.ok(/مشغّل|مستخدم|مشرف/.test(await A.p.$eval('#users-list', x => x.innerText)), 'قايمة الموظفين بتعرض المستوى');

  // ===== المستخدم: ما يمسحش، ويكتب ملاحظة =====
  const U = await openPage(S, {viewport: {width: 1100, height: 900}}); await login(U.p, S, 'usr@farm.com');
  await tab(U.p, 'harvest'); await sub(U.p, 'harvest', 'records'); await sleep(600);
  const delDisabled = await U.p.$$eval('#harvest-tbody .hv-del', bs => bs.every(b => b.disabled));
  T.ok(delDisabled, 'زرار المسح مقفول عند المستخدم');
  await U.p.click('#harvest-tbody tr .rn-btn'); await sleep(400);
  await U.p.fill('#rn-text', 'الجودة تمام ومفيش مشاكل'); await U.p.click('#rn-form button[type=submit]'); await sleep(1500);
  const notes = ((await S.api('boss@farm.com', '/api/db/query', {coll: 'recordNotes'})).j.docs || []).map(d => d.data);
  T.eq(notes.map(n => [n.coll, n.by, n.text]), [['harvest', 'usr@farm.com', 'الجودة تمام ومفيش مشاكل']], 'الملاحظة اتسجّلت باسمه');
  // المستخدم مايقدرش يمسح الملاحظة (مفيش زرار مسح)
  await sleep(500); if(!(await U.p.$('#help-pop'))){ await U.p.click('#harvest-tbody tr .rn-btn'); await sleep(300); }
  T.eq(await U.p.$$eval('#help-pop .rn-del', x => x.length), 0, 'المستخدم مفيش عنده مسح ملاحظات');
  await U.p.click('#help-pop .hp-close');
  // التكاليف للمشرف
  await tab(U.p, 'costs'); await sleep(600);
  T.ok(await U.p.$eval('#cost-form button[type=submit]', b => b.disabled), 'نموذج التكاليف مقفول عند المستخدم');
  // الأوردرات
  await tab(U.p, 'quality'); await sleep(600);
  T.ok(await U.p.$('#q-nav') !== null, 'تاب الجودة مفتوح للمستخدم');

  // ===== المشرف: يمسح ويعدّل ويمسح ملاحظة =====
  const V = await openPage(S, {viewport: {width: 1100, height: 900}}); await login(V.p, S, 'sup@farm.com');
  await tab(V.p, 'harvest'); await sub(V.p, 'harvest', 'records'); await sleep(600);
  T.ok(await V.p.$$eval('#harvest-tbody .hv-del', bs => bs.length > 0 && bs.every(b => !b.disabled)), 'زرار المسح شغّال عند المشرف');
  await V.p.click('#harvest-tbody tr .rn-btn'); await sleep(400);
  T.ok(await V.p.$('#help-pop .rn-del') !== null, 'المشرف شايف مسح الملاحظة');
  await V.p.click('#help-pop .rn-del'); await sleep(1200);
  T.eq(((await S.api('boss@farm.com', '/api/db/query', {coll: 'recordNotes'})).j.docs || []).length, 0, 'المشرف مسح الملاحظة');
  await V.p.click('#help-pop .hp-close').catch(() => {});
  await tab(V.p, 'costs'); await sleep(600);
  T.ok(!(await V.p.$eval('#cost-form button[type=submit]', b => b.disabled)), 'نموذج التكاليف شغّال عند المشرف');

  // ===== عرض بس: يكتب ملاحظة من غير ما يقدر يعدّل =====
  const W = await openPage(S, {viewport: {width: 1100, height: 900}}); await login(W.p, S, 'vw@farm.com');
  await tab(W.p, 'harvest'); await sub(W.p, 'harvest', 'records'); await sleep(600);
  await W.p.click('#harvest-tbody tr .rn-btn'); await sleep(300);
  await W.p.fill('#rn-text', 'ملاحظة من صلاحية عرض'); await W.p.click('#rn-form button[type=submit]'); await sleep(1500);
  const n2 = ((await S.api('boss@farm.com', '/api/db/query', {coll: 'recordNotes'})).j.docs || []).map(d => d.data);
  T.eq(n2.map(n => n.by), ['vw@farm.com'], 'صلاحية «عرض» بس كفاية لكتابة ملاحظة');
  const edit = await S.api('vw@farm.com', '/api/db/commit', {writes: [{op: 'update', path: 'harvest/h1', data: {quantity: 1}}]});
  T.eq(edit.status, 403, 'وبرضه ما يعدّلش السجل نفسه');
  T.eq(A.errs.concat(U.errs, V.errs, W.errs), [], 'مفيش أخطاء في الصفحة');
});
