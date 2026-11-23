/* «نسيت كلمة المرور» من شاشة الدخول: من غير إعداد إيميل بيقول كلّم المدير، ومعاه إعداد بيبعت رابط على الإيميل،
   والرابط بيفتح نافذة كلمة سر جديدة، وبعدها الدخول بالجديدة. */
const {run, baseSeed} = require('./lib');
const {fakeSmtp} = require('../fake-smtp');

run('نسيت كلمة المرور بالإيميل', async ({T, startServer, openPage, sleep}) => {
  const seed = baseSeed({users: [{id: 'u2', username: 'ali@farm.com', role: 'employee', level: 'user', displayName: 'Ali', permissions: {water: 'edit'}}]});

  // ===== من غير إعداد إيميل =====
  const S0 = await startServer(seed);
  const A = await openPage(S0, {viewport: {width: 430, height: 900}});
  await A.p.fill('#login-name', 'ali@farm.com'); await A.p.click('#btn-forgot'); await sleep(800);
  T.ok(/كلّم المدير/.test(await A.p.$eval('#login-error', e => e.textContent)), 'من غير إعداد إيميل: «كلّم المدير»', await A.p.$eval('#login-error', e => e.textContent));

  // ===== بإعداد إيميل =====
  const smtp = await fakeSmtp();
  const S = await startServer(seed, {appUrl: 'http://127.0.0.1:0', mail: {host: '127.0.0.1', port: smtp.port, user: 'farm@gmail.com', pass: 'x', allowInsecure: true}});
  S.cfg.appUrl = S.base;   // السيرفر بيقرا الإعداد وقت التشغيل، فنحدّث الرابط للعنوان الفعلي
  const B = await openPage(S, {viewport: {width: 430, height: 900}});
  await B.p.fill('#login-name', 'ali@farm.com'); await B.p.click('#btn-forgot'); await sleep(1500);
  T.ok(/بعتنا رابط/.test(await B.p.$eval('#login-error', e => e.textContent)), 'ظهرت رسالة «بعتنا رابط»', await B.p.$eval('#login-error', e => e.textContent));
  for(let i = 0; i < 30 && !smtp.mails.length; i++) await sleep(100);
  T.eq(smtp.mails.length, 1, 'الإيميل وصل');
  const text = Buffer.from(smtp.mails[0].data.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
  const m = /(http:\/\/[^\s]+#reset=[A-Za-z0-9_-]+)/.exec(text);
  T.ok(!!m, 'فيه رابط في الإيميل');
  if(m){
    const C = await openPage(S, {viewport: {width: 430, height: 900}}); await C.p.goto(m[1].replace(/^http:\/\/[^/]+/, S.base)); await sleep(1200);
    T.ok(await C.p.$('#lf-rs') !== null, 'الرابط فتح نافذة كلمة سر جديدة');
    await C.p.fill('#lf-rs1', 'Brand-new-1'); await C.p.fill('#lf-rs2', 'different'); await C.p.click('#lf-rs button[type=submit]'); await sleep(300);
    T.ok(/مش زي بعض/.test(await C.p.$eval('#lf-rse', e => e.textContent)), 'كلمتين مختلفتين: بيرفض');
    await C.p.fill('#lf-rs2', 'Brand-new-1'); await C.p.click('#lf-rs button[type=submit]'); await sleep(1200);
    T.ok(/اتغيّرت/.test(await C.p.$eval('#lf-rs', e => e.textContent)), 'اتغيّرت كلمة السر');
    const r = await fetch(S.base + '/api/auth/login', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({email: 'ali@farm.com', password: 'Brand-new-1'})});
    T.eq(r.status, 200, 'الدخول بالجديدة شغّال');
    T.eq(A.errs.concat(B.errs, C.errs), [], 'مفيش أخطاء في الصفحة');
  }
  smtp.srv.close();
});
