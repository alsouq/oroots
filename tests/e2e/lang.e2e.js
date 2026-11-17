/* اللغة بتتزامن بين أجهزة نفس المستخدم: آخر اختيار هو اللي بيكسب، والجهاز الجديد بياخد لغة الحساب */
const {run, baseSeed} = require('./lib');

run('مزامنة اللغة بين الأجهزة', async ({T, startServer, openPage, login, sleep}) => {
  const S = await startServer(baseSeed());
  const langOf = p => p.evaluate(() => document.documentElement.getAttribute('lang'));
  const A = await openPage(S); await login(A.p, S, 'boss@farm.com');
  const B = await openPage(S); await login(B.p, S, 'boss@farm.com');
  T.eq([await langOf(A.p), await langOf(B.p)], ['ar', 'ar'], 'الجهازين بالعربي في الأول');

  await A.p.click('#btn-lang'); await sleep(300); await A.p.click('#lang-menu button[data-l="en"]'); await sleep(2500);
  T.eq(await langOf(A.p), 'en', 'الجهاز الأول بقى إنجليزي');
  T.eq(await langOf(B.p), 'en', 'الجهاز التاني اتحوّل لوحده');
  const hv = await B.p.$eval('.tab-btn[data-tab="harvest"]', x => x.innerText.trim());
  T.ok(/Harvest/.test(hv) && !/[\u0600-\u06FF]/.test(hv), 'اسم التاب اتترجم', hv);

  // جهاز جديد بيختار عربي من شاشة الدخول ⇒ اختياره الأحدث فيكسب على الكل
  const C = await openPage(S, {lang: 'ar'}); await login(C.p, S, 'boss@farm.com'); await sleep(1500);
  T.eq([await langOf(C.p), await langOf(A.p), await langOf(B.p)], ['ar', 'ar', 'ar'], 'اختيار الجهاز الجديد كسب');

  // جهاز جديد من غير اختيار ⇒ لغة الحساب
  const D = await openPage(S); await login(D.p, S, 'boss@farm.com'); await sleep(1000);
  T.eq(await langOf(D.p), 'ar', 'الجهاز الجديد خد لغة الحساب');
  T.eq(A.errs.concat(B.errs, C.errs, D.errs), [], 'مفيش أخطاء في الصفحة');
});
