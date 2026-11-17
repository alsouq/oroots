/* المحلّل الذكي في المتصفح: مزوّد محلي وهمي بواجهة OpenAI (زي Ollama)، والملخص اللي بيتبعت مفيهوش إيميلات،
   والتقرير بيتعرض، وصلاحيات الموظفين (عرض / من غير صلاحية)، والإنجليزي. */
const http = require('http');
const {run, baseSeed, dd} = require('./lib');

run('المحلّل الذكي', async ({T, startServer, openPage, login, tab, sub, sleep}) => {
  const got = [];
  const fake = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const j = JSON.parse(b || '{}'); got.push(j);
    const en = /Recommendations/.test(j.messages[0].content);
    const txt = en ? '## Overall status\nGood overall.\n## Strengths\n- **Stable** EC in S1\n## Risks\n- 🟠 medium — grey mould\n## Recommendations (by priority)\n1. Ventilate at night'
      : '## الوضع العام\nالمزرعة كويسة.\n## المميزات\n- **ثبات** EC في S1\n## المخاطر\n- 🟠 متوسط — عفن رمادي\n## التوصيات (مرتبة بالأولوية)\n1. هوّي بالليل';
    setTimeout(() => { res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify({model: j.model, choices: [{message: {content: txt}, finish_reason: 'stop'}], usage: {prompt_tokens: 500, completion_tokens: 80}})); }, 300);
  }); });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  const FAKE = 'http://127.0.0.1:' + fake.address().port;
  const readings = {};
  for(let i = 0; i < 5; i++){ const ds = dd(-i);
    readings['climate_LG1_' + ds] = {source: 'climate', systemId: 'LG1', date: ds, entries: [9, 13, 17].map(h => ({id: 'c' + i + h, ts: ds + 'T' + String(h).padStart(2, '0') + ':00', temp: 22 + h / 3, rh: 70 + h, by: 'boss@farm.com'}))};
    ['irrigation', 'drainage', 'tank'].forEach((src, k) => { readings[src + '_S1_' + ds] = {source: src, systemId: 'S1', date: ds, entries: [{id: src + i, ts: ds + 'T10:00', ph: 5.9 + k * 0.1, ec: 1.8 + k * 0.4, temp: 22, by: 'boss@farm.com'}]}; });
  }
  const S = await startServer(baseSeed({users: [
    {id: 'u2', username: 'viewer@farm.com', role: 'employee', displayName: 'Viewer', permissions: {ai: 'view', water: 'view'}},
    {id: 'u3', username: 'worker@farm.com', role: 'employee', displayName: 'Worker', permissions: {water: 'edit'}}],
    collections: {readings, sprayPlan: {s1: {id: 's1', date: dd(-2), kind: 'foliar', product: 'فيرتميك', dose: '50 مل/100 لتر', halls: ['LG1'], assignedEmail: 'worker@farm.com'}}}}));
  try{
    const A = await openPage(S, {viewport: {width: 430, height: 1000}}); await login(A.p, S, 'boss@farm.com');
    const a = A.p;
    // الإعدادات: عنوان المزوّد المحلي + اختبار الاتصال
    await tab(a, 'settings');
    await a.evaluate(() => { const c = document.getElementById('ai-card'); const t = c && c.querySelector('.card-toggle'); if(t) t.click(); }); await sleep(600);
    await a.fill('#ai-local-url', FAKE + '/v1'); await a.fill('#ai-local-model', 'qwen-fake'); await a.click('#ai-save'); await sleep(1000);
    await a.$eval('.ai-test[data-p="local"]', x => x.click()); await sleep(1500);
    T.ok(/✅|OK|شغّال|شغال/i.test(await a.$eval('.ai-test-out[data-p="local"]', x => x.innerText)), 'اختبار الاتصال بالمزوّد المحلي', await a.$eval('.ai-test-out[data-p="local"]', x => x.innerText));
    // التاب: معاينة الملخص (مفيش إيميلات) + تحليل
    await tab(a, 'ai');
    await a.click('#ai-prev'); await sleep(600);
    const prev = await a.$eval('.ai-json', x => x.textContent);
    T.ok(!/@/.test(prev), 'الملخص اللي بيتبعت مفيهوش إيميلات');
    T.ok(/"systems"/.test(prev) && /"sprayPlan"/.test(prev), 'الملخص فيه الأنظمة وخطة الرش');
    await a.fill('#ai-q', 'ليه الرطوبة عالية؟'); await a.click('#ai-run'); await sleep(3000);
    const heads = await a.$$eval('.ai-report h3', x => x.map(h => h.innerText));
    T.ok(heads.length >= 3 && /الوضع العام/.test(heads[0]), 'التقرير اتعرض بعناوينه', heads);
    T.ok(/ليه الرطوبة عالية/.test(got[got.length - 1].messages[1].content), 'السؤال وصل للمزوّد');
    // موظف عرض بس: بيشوف التقارير ومفيش زرار تحليل
    const V = await openPage(S); await login(V.p, S, 'viewer@farm.com'); await tab(V.p, 'ai');
    await sleep(800);
    T.ok((await V.p.$$eval('.ai-item', x => x.length)) >= 1 && !(await V.p.$('#ai-run')), 'الموظف «عرض» بيشوف التقارير ومايقدرش يطلب تحليل');
    // موظف من غير صلاحية: التاب مستخبي
    const W = await openPage(S); await login(W.p, S, 'worker@farm.com');
    T.ok(await W.p.$eval('.tab-btn[data-tab="ai"]', x => x.classList.contains('hidden') || x.offsetParent === null), 'الموظف من غير صلاحية مش شايف التاب');
    // بالإنجليزي
    const E = await openPage(S, {lang: 'en'}); await login(E.p, S, 'boss@farm.com'); await tab(E.p, 'ai'); await sub(E.p, 'ai', 'new');
    await E.p.click('#ai-run'); await sleep(3000);
    const eh = await E.p.$$eval('.ai-report h3', x => x.map(h => h.innerText));
    T.ok(/Overall/.test(eh[0] || ''), 'التقرير بالإنجليزي', eh);
    const arLeft = await E.p.evaluate(() => { const o = [], w = document.createTreeWalker(document.getElementById('panel-ai'), NodeFilter.SHOW_TEXT); let n;
      while((n = w.nextNode())){ if(/[؀-ۿ]/.test(n.nodeValue) && n.parentElement.offsetParent !== null && !n.parentElement.closest('[data-noi18n]')) o.push(n.nodeValue.trim().slice(0, 60)); } return o; });
    T.eq(arLeft, [], 'مفيش عربي فاضل في تاب المحلّل بالإنجليزي');
    T.eq(A.errs.concat(V.errs, W.errs, E.errs), [], 'مفيش أخطاء في الصفحة');
  } finally { fake.close(); }
});
