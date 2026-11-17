/* الحصاد من كروت المواسير (قطفة / حصاد نهائي) ومن صنف الطماطم، ومسح السجل بيرجّع المواسير */
const {run, baseSeed, dd} = require('./lib');
const g = (i, crop, start, pipes, plant, max, regrow) => ({id: 'a' + i, crop, start, pipes, plantDate: plant, harvestDays: 30, maxCuts: max, regrowDays: regrow, cuts: 0, lastCutDate: '', color: i});

run('الحصاد من المواسير والطماطم بالصنف', async ({T, startServer, openPage, login, tab, sub, sleep}) => {
  const S = await startServer(baseSeed({settings: {
    pipeMaps: {list: [{systemId: 'S1', totalPipes: 300, plantsPerPipe: 30, groups: [g(0, 'ريحان إيطالي', 0, 100, dd(-75), 5, 15), g(1, 'خس رومين', 100, 80, dd(-40), 1, 0), g(2, 'جرجير', 180, 60, dd(-5), 4, 12)]},
      {systemId: 'S2', totalPipes: 0, plantsPerPipe: 0, groups: [], rows: [{id: 'r1', crop: 'طماطم شيري', plants: 40, plantDate: dd(-90)}, {id: 'r2', crop: 'طماطم شيري', plants: 38, plantDate: dd(-90)}, {id: 'r3', crop: 'طماطم بيف', plants: 30, plantDate: dd(-80)}]}]},
    cropNames: {list: [{id: 'c1', name: 'ريحان إيطالي', maxCuts: 5, regrowDays: 15}]}}}));
  const groups = async () => ((((await S.doc('settings/pipeMaps')) || {}).list || []).filter(m => m.systemId === 'S1')[0] || {groups: []}).groups;
  const harvests = async () => ((await S.api('boss@farm.com', '/api/db/query', {coll: 'harvest'})).j.docs || []).map(d => d.data);
  const A = await openPage(S, {viewport: {width: 390, height: 900}}); await login(A.p, S, 'boss@farm.com');
  const p = A.p;
  await tab(p, 'harvest');
  T.ok(!(await p.$('#harvest-form')), 'فورم تسجيل الحصاد القديم اتشال');
  const hv = async gid => { await p.$eval('.pipe-grp[data-gid="' + gid + '"] .pipe-grp-harvest', b => b.click()); await sleep(300); };

  // 1) قطفة ريحان: 40 ماسورة — 25 كجم
  await hv('a0');
  T.ok(!!(await p.$('#hvd-final')), 'الريحان (أكتر من قطفة) فيه اختيار «آخر قطفة»');
  await p.fill('#hvd-pipes', '40'); await p.fill('#hvd-qty', '25'); await p.click('#hvd-save'); await sleep(1200);
  let H = await harvests(), basil = H.filter(h => h.cropName === 'ريحان إيطالي')[0] || {};
  T.eq([basil.quantity, basil.pipes, basil.systemId], [25, 40, 'S1'], 'سجل قطفة الريحان');
  const cut = (await groups()).filter(x => x.crop === 'ريحان إيطالي' && x.lastCutDate === dd(0))[0] || {};
  T.eq([cut.pipes, cut.cuts], [40, 1], 'الـ 40 ماسورة اتفصلوا واتسجّلت عليهم قطفة، والباقي زي ما هو');

  // 2) خس (قطفة واحدة): حصاد نهائي 120 قطعة ⇒ المجموعة تتشال من المواسير
  await hv('a1');
  await p.fill('#hvd-qty', '120'); await p.selectOption('#hvd-unit', 'قطعة'); await p.click('#hvd-save'); await sleep(1200);
  H = await harvests(); const lettuce = H.filter(h => h.cropName === 'خس رومين')[0] || {};
  T.eq([lettuce.quantity, lettuce.unit], [120, 'قطعة'], 'سجل حصاد الخس');
  T.ok(!(await groups()).some(x => x.crop === 'خس رومين'), 'مواسير الخس فضيت');

  // 3) جرجير مش جاهز + إنهاء بدري
  await hv('a2'); await p.check('#hvd-final'); await p.fill('#hvd-qty', '3'); await p.click('#hvd-save'); await sleep(1200);
  T.ok(!(await groups()).some(x => x.crop === 'جرجير'), 'الجرجير اتقفل بدري');

  // 4) مسح سجل الخس ⇒ المواسير ترجع
  await sub(p, 'harvest', 'records');
  const rows = await p.$$eval('#harvest-tbody tr', trs => trs.map(t => t.innerText));
  const i = rows.findIndex(r => /خس/.test(r));
  T.ok(i >= 0, 'سجل الخس ظاهر في السجلات');
  if(i >= 0){ await p.$$eval('#harvest-tbody tr', (trs, i) => trs[i].querySelector('.hv-del').click(), i); await sleep(1500); }
  T.ok((await groups()).some(x => x.crop === 'خس رومين' && x.pipes === 80 && x.start === 100), 'مواسير الخس رجعت بعد مسح السجل');
  T.ok(!(await harvests()).some(h => h.cropName === 'خس رومين'), 'السجل اتمسح من السيرفر');

  // 5) الطماطم بالصنف (نظام T1)
  await sub(p, 'harvest', 'pipes');
  let switched = false;
  for(const want of ['FG1', 'T1']){
    for(const x of await p.$$('#panel-harvest button')){
      const t = (await x.innerText()).trim();
      if(t === want && await x.isVisible()){ await x.click(); await sleep(700); if(want === 'T1') switched = true; break; }
    }
  }
  if(!switched){ for(const s of await p.$$('#panel-harvest select')){ if(await s.evaluate(e => [...e.options].some(o => o.value === 'S2'))){ await s.selectOption('S2'); switched = true; break; } } }
  await sleep(800);
  const vcards = await p.$$eval('.rw-hv', bs => bs.length);
  T.eq(vcards, 2, 'كارت لكل صنف طماطم (شيري / بيف)');
  if(vcards){
    await p.$eval('.rw-hv', b => b.click()); await sleep(300);
    await p.$$eval('.hvd-row', cs => cs[1].click()); await p.fill('#hvd-qty', '18.5'); await p.click('#hvd-save'); await sleep(1200);
    const tom = (await harvests()).filter(h => /طماطم شيري/.test(h.cropName || ''))[0] || {};
    T.eq([tom.quantity, tom.systemId], [18.5, 'S2'], 'سجل حصاد الطماطم الشيري');
  }
  T.eq(A.errs, [], 'مفيش أخطاء في الصفحة');
});
