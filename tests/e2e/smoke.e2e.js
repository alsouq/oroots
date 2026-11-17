/* جولة سريعة: المدير بيفتح كل تاب وكل قسم فرعي بالعربي وبالإنجليزي — مفيش أخطاء في الصفحة، ومفيش عربي فاضل في الإنجليزي.
   (لو الصفحة وقفت على شاشة التحميل غالبًا بصمة CSP في index.html محتاجة تتحدّث بعد تعديل الكود) */
const {run, baseSeed, dd} = require('./lib');

run('جولة على كل التابات (عربي / إنجليزي)', async ({T, startServer, openPage, login, sleep}) => {
  const ds = dd(0);
  const S = await startServer(baseSeed({collections: {readings: {
    ['tank_S1_' + ds]: {source: 'tank', systemId: 'S1', date: ds, entries: [{id: 'k1', ts: ds + 'T09:00', ph: 6, ec: 1.9, temp: 22, by: 'boss@farm.com'}]},
    ['climate_LG1_' + ds]: {source: 'climate', systemId: 'LG1', date: ds, entries: [{id: 'c1', ts: ds + 'T09:00', temp: 24, rh: 70, by: 'boss@farm.com'}]}}}}));
  const tour = async (p, lang) => {
    const tabs = await p.$$eval('.tab-btn[data-tab]', bs => bs.filter(b => b.offsetParent !== null && !b.classList.contains('hidden')).map(b => b.getAttribute('data-tab')));
    T.ok(tabs.length >= 10, '[' + lang + '] التابات ظاهرة (' + tabs.length + ')');
    const arabic = {};
    for(const t of tabs){
      await p.click('.tab-btn[data-tab="' + t + '"]'); await sleep(500);
      const subs = await p.$$eval('#panel-' + t + ' .subtab-btn', bs => bs.filter(b => b.offsetParent !== null).map(b => b.getAttribute('data-subtab'))).catch(() => []);
      for(const s of (subs.length ? subs : [null])){
        if(s){ await p.click('#panel-' + t + ' .subtab-btn[data-subtab="' + s + '"]').catch(() => {}); await sleep(350); }
        if(lang === 'en'){
          const left = await p.evaluate(id => { const root = document.getElementById(id); if(!root) return []; const o = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
            while((n = w.nextNode())){ const el = n.parentElement; if(/[؀-ۿ]/.test(n.nodeValue) && el.offsetParent !== null && !el.closest('[data-noi18n],[translate="no"],script,style')) o.push(n.nodeValue.trim().slice(0, 50)); }
            return o; }, 'panel-' + t);
          if(left.length) arabic[t + (s ? '/' + s : '')] = left.slice(0, 4);
        }
      }
    }
    return arabic;
  };
  const A = await openPage(S, {viewport: {width: 1280, height: 900}}); await login(A.p, S, 'boss@farm.com');
  await tour(A.p, 'ar');
  T.eq(A.errs, [], '[ar] مفيش أخطاء في الصفحة');
  const E = await openPage(S, {lang: 'en', viewport: {width: 390, height: 844}}); await login(E.p, S, 'boss@farm.com');
  T.eq(await E.p.evaluate(() => document.documentElement.getAttribute('lang')), 'en', '[en] الصفحة بالإنجليزي');
  const left = await tour(E.p, 'en');
  T.eq(left, {}, '[en] مفيش نصوص عربي من الواجهة فاضلة في التابات');
  T.eq(E.errs, [], '[en] مفيش أخطاء في الصفحة');
});
