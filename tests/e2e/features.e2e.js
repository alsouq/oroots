/* ثلاث ميزات: (1) تعبئة خزان الري بقياس قبل/بعد ← لترات وتكلفة في «التكاليف»، (2) سجل المواسير بين تاريخين،
   (3) DLI المقدّر من طقس برّه × نسبة الصوبة لليوم اللي قراءاته ناقصة. */
const {run, baseSeed, dd} = require('./lib');
const today = dd(0);

run('تعبئة الخزان + سجل المواسير + DLI المقدّر', async ({T, startServer, openPage, login, tab, sub, sleep}) => {
  // قراءات مناخ كاملة (كل ساعة من 7 لـ 15 بتوقيت القاهرة) للأيام -6 لـ -3، ويوم -2 قراءتين بس، ويوم -1 من غير قراءات
  const climate = {}, full = n => { const d = dd(n); climate['climate_LG1_' + d] = {source: 'climate', systemId: 'LG1', date: d, entries: [7, 8, 9, 10, 11, 12, 13, 14, 15].map(h => ({id: 'c' + n + h, ts: d + 'T' + String(h).padStart(2, '0') + ':00', temp: 24, rh: 60, lux: 30000, by: 'boss@farm.com'}))}; };
  [-6, -5, -4, -3].forEach(full);
  const dp = dd(-2); climate['climate_LG1_' + dp] = {source: 'climate', systemId: 'LG1', date: dp, entries: [{id: 'p1', ts: dp + 'T10:00', temp: 24, rh: 60, lux: 30000, by: 'boss@farm.com'}, {id: 'p2', ts: dp + 'T11:00', temp: 24, rh: 60, lux: 30000, by: 'boss@farm.com'}]};
  const snap = (n, planted, byCrop) => ({['S1_' + dd(n)]: {systemId: 'S1', date: dd(n), total: 300, planted, empty: 300 - planted, byCrop}});
  const S = await startServer(baseSeed({
    settings: {config: {weatherLat: 30.04, weatherLon: 31.24, weatherName: 'Cairo'},
      pipeMaps: {list: [{systemId: 'S1', totalPipes: 300, plantsPerPipe: 30, groups: [{id: 'a', crop: 'خس', start: 0, pipes: 120, plantDate: dd(-10), harvestDays: 30, maxCuts: 1, regrowDays: 0, cuts: 0, lastCutDate: '', color: 0}, {id: 'b', crop: 'ريحان', start: 120, pipes: 60, plantDate: dd(-5), harvestDays: 30, maxCuts: 4, regrowDays: 12, cuts: 0, lastCutDate: '', color: 1}]}]}},
    collections: {readings: climate, pipeSnaps: Object.assign({}, snap(-3, 100, {'خس': 100}), snap(-2, 150, {'خس': 100, 'ريحان': 50}))}
  }));

  // طقس برّه: نفس الإشعاع (12 MJ/م²) كل يوم، فالنسبة ثابتة وسهل نتحقق منها
  const mockWx = async p => {
    await p.route(/api\.open-meteo\.com/, route => {
      const url = route.request().url();
      if(/daily=shortwave_radiation_sum&?$|past_days=60/.test(url)){
        const time = [], v = []; for(let i = -60; i <= 0; i++){ time.push(dd(i)); v.push(12); }
        return route.fulfill({contentType: 'application/json', body: JSON.stringify({daily: {time, shortwave_radiation_sum: v}})});
      }
      return route.fulfill({status: 500, body: '{}'});
    });
  };

  const A = await openPage(S, {tz: 'Africa/Cairo', viewport: {width: 1100, height: 900}, setup: mockWx}); await login(A.p, S, 'boss@farm.com');
  const a = A.p;

  // ===== 1) تعبئة الخزان =====
  await tab(a, 'water'); await sub(a, 'water', 'fill');
  T.ok(await a.$('#wf-dim-form') !== null && await a.$('#wf-form') === null, 'من غير أبعاد: بيطلب الأبعاد الأول ومفيش فورم تعبئة');
  await a.fill('#wf-len', '200'); await a.fill('#wf-wid', '150'); await a.fill('#wf-price', '8'); await a.click('#wf-dim-form button[type=submit]'); await sleep(1500);
  const td = await S.doc('settings/tankDims');
  T.eq([td.list[0].systemId, td.list[0].lengthCm, td.list[0].widthCm, td.price], ['S1', 200, 150, 8], 'أبعاد الخزان وسعر المياه اتحفظوا');
  await a.fill('#wf-before', '30'); await a.fill('#wf-after', '45'); await sleep(300);
  T.ok(/450/.test(await a.$eval('#wf-preview', x => x.innerText)) && /3\.6|3,6/.test(await a.$eval('#wf-preview', x => x.innerText)), 'المعاينة: 450 لتر وتكلفة 3.6', await a.$eval('#wf-preview', x => x.innerText));
  await a.fill('#wf-after', '20'); await sleep(300);
  T.ok(/لازم يكون أكبر/.test(await a.$eval('#wf-preview', x => x.innerText)), 'قياس بعد أقل من قبل بيتحذّر منه');
  await a.fill('#wf-after', '45'); await a.click('#wf-form button[type=submit]'); await sleep(1800);
  const fills = ((await S.api('boss@farm.com', '/api/db/query', {coll: 'waterFills'})).j.docs || []).map(d => d.data);
  T.eq(fills.map(f => [f.systemId, f.liters, f.cost, f.price]), [['S1', 450, 3.6, 8]], 'التعبئة اتسجّلت: 450 لتر × 8 ج.م/م³');
  T.ok(/450/.test(await a.$eval('#water-fill', x => x.innerText)), 'التعبئة ظاهرة في الجدول');
  // بتدخل في التكاليف
  await tab(a, 'costs');
  const ct = await a.$eval('#cost-body', x => x.textContent);
  T.ok(/مياه/.test(ct) && /تعبئة خزان/.test(ct), 'تكلفة المياه ظاهرة في التكاليف', ct.slice(0, 200));
  T.ok(await a.$$eval('#cost-body tr[data-id^="wf-"] .cost-del', x => x.length) === 0, 'صف التكلفة التلقائي من غير زرار حذف');

  // ===== 2) سجل المواسير =====
  await tab(a, 'harvest'); await sub(a, 'harvest', 'history'); await sleep(800);
  await a.fill('#ph-from', dd(-4)); await a.fill('#ph-to', today); await a.click('#ph-form button[type=submit]'); await sleep(600);
  const rows = await a.$$eval('#pipe-history tbody tr', trs => trs.map(t => [...t.children].map(c => c.innerText.trim().replace(/\s*≈$/, '').replace(/\s+/g, ' '))));
  const byDate = Object.fromEntries(rows.map(r => [r[0], r]));
  T.ok(/مفيش بيانات/.test((byDate[dd(-4)] || []).join(' ')), 'يوم قبل بداية السجل: مفيش بيانات');
  T.eq((byDate[dd(-3)] || []).slice(1, 4), ['300', '100', '200'], 'يوم -3: 300 إجمالي / 100 منزرع / 200 فاضي');
  T.eq((byDate[dd(-2)] || []).slice(1, 4), ['300', '150', '150'], 'يوم -2: 150 منزرع');
  T.eq((byDate[dd(-1)] || []).slice(1, 4), ['300', '150', '150'], 'يوم -1 من غير لقطة بياخد آخر وضع (≈)');
  T.eq((byDate[today] || []).slice(1, 4), ['300', '180', '120'], 'النهارده: 180 منزرع (120 خس + 60 ريحان) من مخطط المواسير الحالي');
  const heads = await a.$$eval('#pipe-history thead th', ths => ths.map(t => t.innerText.trim()));
  T.ok(heads.indexOf('خس') >= 0 && heads.indexOf('ريحان') >= 0, 'أعمدة لكل صنف', heads);
  // تعديل المخطط من التطبيق ⇒ لقطة النهارده تتحدّث
  const cur = (await S.doc('settings/pipeMaps')).list;
  cur[0].groups = cur[0].groups.filter(g => g.id !== 'b');
  await S.api('boss@farm.com', '/api/db/commit', {writes: [{op: 'set', path: 'settings/pipeMaps', data: {list: cur}}]}); await sleep(1500);
  await a.click('#ph-form button[type=submit]'); await sleep(500);
  const today2 = await a.$$eval('#pipe-history tbody tr', trs => trs.map(t => [...t.children].map(c => c.innerText.trim()))[0]);
  T.eq(today2.slice(1, 4), ['300', '120', '180'], 'بعد حصاد الريحان: 120 منزرع و180 فاضي');

  // ===== 3) DLI المقدّر =====
  await tab(a, 'climate'); await sub(a, 'climate', 'charts'); await sleep(1500);
  await a.evaluate(() => { const d = document.querySelector('#climate-body details.chart-card'); if(d) d.open = true; });
  const trs = await a.$$eval('#climate-body details.chart-card tbody tr', rs => rs.map(t => [...t.children].map(c => c.innerText.trim())));
  const rowOf = d => trs.filter(r => r[0] === d)[0];
  const measured = rowOf(dd(-4)), partial = rowOf(dd(-2)), none = rowOf(dd(-1));
  T.ok(!!measured && measured[5] === 'مقاس', 'يوم قراءاته كاملة: مقاس', measured);
  const k = parseFloat(measured[3]) / 100, out = parseFloat(measured[2]);
  T.ok(k > 0.1 && out > 20, 'نسبة الصوبة محسوبة من الطقس', [measured[3], measured[2]]);
  T.ok(!!partial && /تقدير/.test(partial[5]), 'يوم قراءتين بس: DLI بيتقدّر مش بياخد القراءتين', partial);
  T.ok(!!none && /تقدير/.test(none[5]), 'يوم من غير قراءات: بيتقدّر', none);
  T.ok(Math.abs(parseFloat(none[4]) - k * out) < 0.6, 'التقدير = النسبة × DLI برّه', [none[4], (k * out).toFixed(2)]);
  // ملخص اليوم الناقص بيشرح التقدير
  await sub(a, 'climate', 'summary'); await sleep(300);
  T.eq(A.errs, [], 'مفيش أخطاء في الصفحة');

  // بالإنجليزي
  const E = await openPage(S, {lang: 'en', tz: 'Africa/Cairo', viewport: {width: 1100, height: 900}, setup: mockWx}); await login(E.p, S, 'boss@farm.com');
  await tab(E.p, 'water'); await sub(E.p, 'water', 'fill'); await sleep(500);
  await tab(E.p, 'harvest'); await sub(E.p, 'harvest', 'history'); await sleep(800);
  const arPipe = await E.p.$eval('#pipe-history', x => x.innerText);
  T.ok(!/[؀-ۿ]/.test(arPipe.replace(/خس|ريحان/g, '')), 'سجل المواسير بالإنجليزي من غير عربي (غير أسماء الأصناف)', arPipe.slice(0, 200));
  await tab(E.p, 'water'); await sub(E.p, 'water', 'fill');
  const arFill = await E.p.$eval('#water-fill', x => x.innerText);
  T.ok(!/[؀-ۿ]/.test(arFill), 'تعبئة الخزان بالإنجليزي', arFill.slice(0, 200));
  T.eq(E.errs, [], 'مفيش أخطاء (إنجليزي)');
});
