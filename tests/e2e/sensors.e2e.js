/* الحساسات: الحساس بيبعت للسيرفر ⇒ القراءة بتظهر في تاب المناخ على طول، وكارت «الحساسات» في الإعدادات بيقول مين شغّال ومين لسه،
   والكارت للمدير بس، ومترجم بالإنجليزي. */
const {run, baseSeed, freePort} = require('./lib');
const KEY = 'farm-sensors-key-123456';

run('الحساسات', async ({T, startServer, openPage, login, tab, sub, sleep}) => {
  const sp = await freePort();
  const S = await startServer(baseSeed({users: [{id: 'u2', username: 'ali@farm.com', role: 'employee', displayName: 'Ali', permissions: {climate: 'edit', settings: 'view'}}]}),
    {sensors: {apiKey: KEY, port: sp, host: '127.0.0.1', devices: {'lg1-climate': {type: 'climate', greenhouse: 'LG1'}, 's1-tank': {type: 'water', source: 'tank', systemId: 'S1'}}}});
  const send = body => fetch('http://127.0.0.1:' + sp + '/ingest', {method: 'POST', headers: {'content-type': 'application/json', 'x-api-key': KEY}, body: JSON.stringify(body)}).then(r => r.status);
  for(let i = 0; i < 50; i++){ try{ await send({}); break; }catch(e){ await sleep(100); } }

  const A = await openPage(S, {viewport: {width: 1100, height: 900}}); await login(A.p, S, 'boss@farm.com');
  await tab(A.p, 'climate'); await sub(A.p, 'climate', 'records');
  T.eq(await send({device: 'lg1-climate', temp: 26.4, rh: 61, lux: 3500}), 200, 'الحساس بعت قراءة');
  await sleep(1500);
  T.ok(await A.p.evaluate(() => /26\.4/.test(document.getElementById('panel-climate').innerText)), 'القراءة ظهرت في سجل المناخ لوحدها (من غير تحديث الصفحة)');

  const card = async p => p.evaluate(() => {
    const c = document.getElementById('sensors-card'); if(!c || c.style.display === 'none') return null;
    const t = c.querySelector('.card-toggle'), box = document.getElementById('sensors-set'); if(t && (!box || box.offsetParent === null)) t.click();   // الكارت مقفول ⇒ افتحه
    return true;
  });
  await tab(A.p, 'settings'); await card(A.p); await sleep(1500);
  const rows = await A.p.$$eval('#sensors-set tbody tr', trs => trs.map(t => [t.children[0].innerText.trim(), t.children[4].innerText.trim()]));
  T.eq(rows, [['lg1-climate', 'بيبعت عادي'], ['s1-tank', 'لسه ما بعتش']], 'الكارت بيقول مين شغّال ومين لسه');
  T.ok(/26\.4°C/.test(await A.p.$eval('#sensors-set', x => x.innerText)), 'آخر قيم الحساس ظاهرة');

  // الموظف ما يشوفش الكارت
  const E = await openPage(S); await login(E.p, S, 'ali@farm.com');
  await E.p.click('.tab-btn[data-tab="settings"]').catch(() => {}); await sleep(800);
  T.eq(await E.p.evaluate(() => { const c = document.getElementById('sensors-card'); return !!c && c.style.display !== 'none'; }), false, 'الكارت للمدير بس');

  // بالإنجليزي: مفيش عربي في الكارت
  const N = await openPage(S, {lang: 'en', viewport: {width: 1100, height: 900}}); await login(N.p, S, 'boss@farm.com');
  await tab(N.p, 'settings'); await card(N.p); await sleep(1500);
  const txt = await N.p.$eval('#sensors-card', x => x.innerText);
  T.ok(/Sensors/.test(txt) && /Online/.test(txt) && !/[\u0600-\u06FF]/.test(txt), 'الكارت مترجم بالإنجليزي', txt.slice(0, 600));
  T.eq(A.errs.concat(E.errs, N.errs), [], 'مفيش أخطاء في الصفحة');
});
