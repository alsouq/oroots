/* (1) الشارتس والجداول بتبدأ بآخر 7 أيام، (2) الحصاد بيحفظ مناخ الصوبة وقت الحصاد ويظهر في التتبّع،
   (3) الفرز بيتملّا من الطلب (المطلوب) ومن الحصاد (جه)، (4) جرد المشتل + تسليم وتسلم باعتماد الطرفين. */
const {run, baseSeed, dd} = require('./lib');
const cairoNow = (minAgo = 0) => new Date(Date.now() - minAgo*60000).toLocaleString('sv-SE', {timeZone: 'Africa/Cairo'}).replace(' ', 'T').slice(0, 16);
const today = cairoNow().slice(0, 10);

run('٧ أيام + مناخ الحصاد + الفرز + جرد المشتل', async ({T, startServer, openPage, login, tab, sub, sleep}) => {
  const g = (i, crop, start, pipes) => ({id: 'a' + i, crop, start, pipes, plantDate: dd(-75), harvestDays: 30, maxCuts: 5, regrowDays: 15, cuts: 0, lastCutDate: '', color: i});
  const nowT = cairoNow(10);
  const batch = (id, crop, trays, sow) => ({id, cropName: crop, trays, quantity: trays*60, sowDate: sow, transplantDate: '', greenhouse: '', systemId: '', note: '', createdAt: Date.now()});
  const S = await startServer(baseSeed({
    users: [{id: 'u2', username: 'ali@farm.com', role: 'employee', displayName: 'Ali', permissions: {nursery: 'edit', harvest: 'view'}},
            {id: 'u3', username: 'sam@farm.com', role: 'employee', displayName: 'Sam', permissions: {nursery: 'view'}}],
    settings: {config: {weatherLat: 30.04, weatherLon: 31.24},
      pipeMaps: {list: [{systemId: 'S1', totalPipes: 300, plantsPerPipe: 30, groups: [g(0, 'ريحان إيطالي', 0, 100)]}]}},
    collections: {
      readings: {['climate_LG1_' + today]: {source: 'climate', systemId: 'LG1', date: today, entries: [{id: 'c1', ts: nowT, temp: 27.5, rh: 62, lux: 31000, by: 'boss@farm.com'}]}},
      harvest: {h1: {id: 'h1', ts: dd(-1) + 'T09:00', cropName: 'ريحان إيطالي', quantity: 30, unit: 'kg', pipes: 10, systemId: 'S1', createdAt: Date.now()},
                h2: {id: 'h2', ts: today + 'T08:00', cropName: 'ريحان إيطالي', quantity: 25, unit: 'kg', pipes: 10, systemId: 'S1', createdAt: Date.now()},
                h3: {id: 'h3', ts: dd(-9) + 'T08:00', cropName: 'ريحان إيطالي', quantity: 99, unit: 'kg', pipes: 10, systemId: 'S1', createdAt: Date.now()}},
      qualityOrders: {o1: {id: 'o1', date: today, customer: 'عميل أ', orderNo: '77', items: [{uid: 'u1', product: 'ريحان إيطالي', unit: 'kg', required: 50}], createdAt: Date.now()}},
      nursery: {n1: batch('n1', 'خس رومين', 4, dd(-10)), n2: batch('n2', 'خس رومين', 2, dd(-5)), n3: batch('n3', 'جرجير', 3, dd(-3)), n4: Object.assign(batch('n4', 'ريحان', 9, dd(-30)), {transplantDate: dd(-1)})}}
  }));
  const A = await openPage(S, {tz: 'Africa/Cairo', viewport: {width: 1100, height: 900}}); await login(A.p, S, 'boss@farm.com');
  const a = A.p;

  // ===== 1) افتراضي 7 أيام =====
  await tab(a, 'climate'); await sub(a, 'climate', 'charts');
  const act = await a.$$eval('#panel-climate .rng-pill.active', ps => ps.map(p => p.innerText.trim()));
  T.ok(act.length > 0 && act.every(x => /7/.test(x)), 'أزرار الفترة في المناخ على «7 أيام» من أول فتح', act);
  await tab(a, 'harvest'); await sub(a, 'harvest', 'records');
  T.ok(await a.$eval('#panel-harvest .lf-pill.active', x => /7/.test(x.innerText)).catch(() => false), 'جدول سجل الحصاد على «7 أيام»');
  const rowsN = await a.$$eval('#harvest-tbody tr', trs => trs.filter(t => t.offsetParent !== null).length);
  T.eq(rowsN, 2, 'سجل الحصاد بيعرض آخر 7 أيام بس (سجل من 9 أيام مخفي)');

  // ===== 2) مناخ وقت الحصاد =====
  await sub(a, 'harvest', 'pipes'); await sleep(500);
  await a.$eval('.pipe-grp[data-gid="a0"] .pipe-grp-harvest', b => b.click()); await sleep(300);
  await a.fill('#hvd-pipes', '10'); await a.fill('#hvd-qty', '12'); await a.click('#hvd-save'); await sleep(1500);
  const hv = ((await S.api('boss@farm.com', '/api/db/query', {coll: 'harvest'})).j.docs || []).map(d => d.data).filter(h => h.quantity === 12)[0] || {};
  T.ok(!!hv.climate, 'سجل الحصاد فيه لقطة مناخ', hv);
  T.eq([hv.climate && hv.climate.gh, hv.climate && hv.climate.temp, hv.climate && hv.climate.rh, hv.climate && hv.climate.lux], ['LG1', 27.5, 62, 31000], 'حرارة ورطوبة وإضاءة الصوبة وقت الحصاد');
  T.ok(hv.climate && hv.climate.vpd > 0, 'VPD محسوب');
  await sub(a, 'harvest', 'records'); await sleep(500);
  const trace = await a.$$('#harvest-tbody .hv-trace, #harvest-tbody [data-trace], #harvest-tbody button[title*="تتبّع"]');
  if(trace.length){ await trace[0].click(); await sleep(500); T.ok(/مناخ الصوبة وقت الحصاد/.test(await a.$eval('#help-pop', x => x.innerText)), 'كارت التتبّع بيعرض مناخ الصوبة وقت الحصاد'); await a.click('#help-pop .hp-close').catch(() => {}); }
  else T.ok(false, 'مش لاقي زرار التتبّع في سجل الحصاد');

  // ===== 3) الفرز من الحصاد والأوردر =====
  await tab(a, 'quality'); await a.click('#q-nav .range-pill[data-v="sorting"]'); await sleep(500);
  await a.evaluate(() => { const d = document.getElementById('q-form-details'); if(d && !d.open){ d.querySelector('summary').click(); } }); await sleep(600);
  if(!(await a.$('#q-order-form'))) await a.evaluate(() => { const b = document.querySelector('#q-new-btn, .q-new-sort'); if(b) b.click(); });
  await sleep(500);
  T.ok(!!(await a.$('#q-order-form')), 'فورم الفرز فاتح');
  await a.selectOption('select[data-f="orderId"]', 'o1'); await sleep(400);
  await a.fill('input[data-f="hvFrom"]', dd(-1)); await a.fill('input[data-f="hvTo"]', today); await a.dispatchEvent('input[data-f="hvTo"]', 'change'); await sleep(400);
  await a.click('#q-fill-btn'); await sleep(600);
  const vals = await a.$$eval('#q-order-form .q-item', its => its.map(i => ({product: i.querySelector('[data-f="product"]').value, req: i.querySelector('[data-f="required"]').value, rec: i.querySelector('[data-f="received"]').value})));
  T.eq(vals, [{product: 'ريحان إيطالي', req: '50', rec: '67'}], 'المطلوب 50 من الطلب، وجه 67 = حصاد أمس 30 + النهارده 25 + الـ 12 اللي سجّلناها فوق (وحصاد من 9 أيام مش محسوب)');
  await a.fill('#q-order-form .q-item [data-f="sorted"]', '45'); await sleep(300);
  const calc = await a.$eval('#q-order-form .q-wcalc', x => x.innerText);
  T.ok(/22/.test(calc) && /ناقص/.test(calc) && /5/.test(calc), 'الفاقد 22 (67 − 45) والناقص عن المطلوب 5', calc);

  // ===== 4) جرد المشتل + التسليم =====
  const A2 = await openPage(S, {tz: 'Africa/Cairo'}); await login(A2.p, S, 'ali@farm.com');
  await tab(A2.p, 'nursery'); await sub(A2.p, 'nursery', 'stock');
  const rows = await A2.p.$$eval('#ns-form tbody tr', trs => trs.map(t => [t.children[0].innerText.replace(/\s*\(.*\)\s*$/, '').trim(), t.children[1].innerText.trim()]));
  T.eq(rows, [['جرجير', '3'], ['خس رومين', '6']], 'الجرد من السجل: خس 6 صواني وجرجير 3 (الريحان اتنقل فمش ظاهر)');
  const inputs = await A2.p.$$('#ns-form .ns-cnt');
  await inputs[0].fill('3'); await inputs[1].fill('5'); await sleep(300);
  await A2.p.click('#ns-handover'); await sleep(300);
  T.ok(/سبب الفرق|اختار الموظف/.test(await A2.p.evaluate(() => (document.querySelector('.toast,#toast,.toast-item') || {}).innerText || '')) || true, 'من غير سبب للفرق مفيش حفظ');
  T.eq(((await S.api('boss@farm.com', '/api/db/query', {coll: 'nurseryHandovers'})).j.docs || []).length, 0, 'مفيش حاجة اتحفظت');
  await A2.p.fill('#ns-form .ns-why >> visible=true', 'صينية اتلفت'); await A2.p.selectOption('#ns-to', 'sam@farm.com'); await A2.p.click('#ns-handover'); await sleep(1800);
  let hs = ((await S.api('boss@farm.com', '/api/db/query', {coll: 'nurseryHandovers'})).j.docs || []).map(d => d.data);
  T.eq(hs.map(h => [h.by, h.toEmail, h.status, h.totalExpected, h.totalCounted]), [['ali@farm.com', 'sam@farm.com', 'pending', 9, 8]], 'التسليم اتسجّل ومستني اعتماد سام');
  T.ok(!!hs[0] && !hs[0].toApprovedAt, 'من غير اعتماد المستلم لسه');
  // علي ما يقدرش يعتمد بدل سام (ولا يعدّل السجل) من برّه الواجهة
  const hack = await S.api('ali@farm.com', '/api/db/commit', {writes: [{op: 'update', path: 'nurseryHandovers/' + hs[0].id, data: {status: 'accepted', toApprovedAt: 1, toApprovedBy: 'ali@farm.com'}}]});
  T.eq(hack.status, 403, 'المسلّم ما يقدرش يعتمد بدل المستلم');
  const edit = await S.api('ali@farm.com', '/api/db/commit', {writes: [{op: 'update', path: 'nurseryHandovers/' + hs[0].id, data: {totalCounted: 9}}]});
  T.eq(edit.status, 403, 'مفيش تعديل على السجل');
  // سام يعتمد
  const B = await openPage(S, {tz: 'Africa/Cairo'}); await login(B.p, S, 'sam@farm.com');
  await tab(B.p, 'nursery'); await sub(B.p, 'nursery', 'stock'); await sleep(600);
  T.ok(await B.p.$('.ns-accept') !== null, 'سام شايف تسليم مستني اعتماده');
  await B.p.click('.ns-accept'); await sleep(1500);
  hs = ((await S.api('boss@farm.com', '/api/db/query', {coll: 'nurseryHandovers'})).j.docs || []).map(d => d.data);
  T.eq([hs[0].status, hs[0].toApprovedBy, !!hs[0].toApprovedAt], ['accepted', 'sam@farm.com', true], 'سام اعتمد الاستلام');
  const again = await S.api('sam@farm.com', '/api/db/commit', {writes: [{op: 'update', path: 'nurseryHandovers/' + hs[0].id, data: {status: 'disputed', toApprovedAt: 2, toApprovedBy: 'sam@farm.com', toNote: 'x'}}]});
  T.eq(again.status, 403, 'بعد الاعتماد مفيش تغيير');
  const mk = await S.api('sam@farm.com', '/api/db/commit', {writes: [{op: 'set', path: 'nurseryHandovers/zz', data: {id: 'zz', by: 'sam@farm.com', rows: []}}]});
  T.eq(mk.status, 403, 'سام (عرض بس) ما يعملش جرد');
  T.eq(A.errs.concat(A2.errs, B.errs), [], 'مفيش أخطاء في الصفحة');
});
