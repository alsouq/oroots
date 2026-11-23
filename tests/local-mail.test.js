/* «نسيت كلمة المرور» بالإيميل: السيرفر يبعت رابط (SMTP — هنا سيرفر وهمي) ← الموظف يختار كلمة سر جديدة ← الرابط ينفع مرة واحدة.
   كمان: من غير إعداد إيميل بيرفض بوضوح، وما بنكشفش مين عنده حساب، والطلبات المتكررة بتتحدّد. */
process.removeAllListeners('warning');
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const {createServer} = require('../server/server.js');

const ADMIN = 'boss@farm.com';
const {fakeSmtp} = require('./fake-smtp');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const smtp = await fakeSmtp();
  const mk = (extra) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oroots-mail-'));
    return Object.assign({port: 0, host: '127.0.0.1', dataDir: path.join(tmp, 'data'), publicDir: path.join(tmp, 'public'), backupDir: path.join(tmp, 'backups'), adminEmail: ADMIN, jobs: false}, extra);
  };
  const start = async cfg => {
    fs.mkdirSync(cfg.publicDir, {recursive: true}); fs.writeFileSync(path.join(cfg.publicDir, 'index.html'), 'x');
    const app = createServer(cfg); await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const call = async (url, body, headers) => { const r = await fetch(base + url, {method: 'POST', headers: Object.assign({'content-type': 'application/json'}, headers || {}), body: JSON.stringify(body || {})}); return {status: r.status, j: await r.json().catch(() => ({}))}; };
    return {app, call, close: () => app.server.close()};
  };

  // ===== من غير إعداد إيميل =====
  const S0 = await start(mk({}));
  const r0 = await S0.call('/api/auth/forgot', {email: 'ali@farm.com'});
  assert.strictEqual(r0.status, 503); assert.strictEqual(r0.j.error, 'auth/mail-not-configured', 'من غير إعداد إيميل: رفض واضح');
  S0.close();

  // ===== بإعداد إيميل =====
  const cfg = mk({appUrl: 'https://farm.example.ts.net/', mail: {host: '127.0.0.1', port: smtp.port, user: 'farm@gmail.com', pass: 'abcd efgh', from: "O'Roots <farm@gmail.com>", allowInsecure: true}});
  const S = await start(cfg);
  const adminPw = fs.readFileSync(path.join(cfg.dataDir, 'first-admin.txt'), 'utf8').split('\n')[1].replace(/.*: /, '').trim();
  const A = (await S.call('/api/auth/login', {email: ADMIN, password: adminPw})).j.token;
  assert.strictEqual((await S.call('/api/auth/create', {email: 'ali@farm.com', password: 'old-pass1'}, {authorization: 'Bearer ' + A})).status, 200);

  assert.strictEqual((await S.call('/api/auth/forgot', {email: 'not-an-email'})).j.error, 'auth/invalid-email');
  const ghost = await S.call('/api/auth/forgot', {email: 'ghost@farm.com'});
  assert.deepStrictEqual([ghost.status, ghost.j.ok], [200, true], 'إيميل مش مسجّل: نفس الرد (محدش يعرف مين عندنا حساب)');
  await sleep(300); assert.strictEqual(smtp.mails.length, 0, 'ومفيش إيميل اتبعت');

  const ok = await S.call('/api/auth/forgot', {email: 'Ali@Farm.com'});
  assert.deepStrictEqual([ok.status, ok.j.ok], [200, true]);
  for(let i = 0; i < 40 && !smtp.mails.length; i++) await sleep(100);
  assert.strictEqual(smtp.mails.length, 1, 'الإيميل اتبعت');
  const m = smtp.mails[0];
  assert(m.auth.includes('farm@gmail.com') && m.auth.includes('abcd efgh'), 'دخل بحساب الإيميل');
  assert(/<farm@gmail.com>/.test(m.from) && /<ali@farm.com>/.test(m.to), 'من وإلى');
  const [head, body64] = m.data.split('\r\n\r\n');
  const subj = /Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(head); assert(subj, 'العنوان عربي مشفّر');
  assert(Buffer.from(subj[1], 'base64').toString('utf8').includes('كلمة المرور'));
  const text = Buffer.from(body64.replace(/\r\n/g, ''), 'base64').toString('utf8');
  const tk = /https:\/\/farm\.example\.ts\.net\/#reset=([A-Za-z0-9_-]+)/.exec(text); assert(tk, 'الرابط على عنوان النظام: ' + text);
  const token = tk[1];

  // الرابط
  assert.strictEqual((await S.call('/api/auth/reset-token', {token: 'bad-token-bad-token-bad', password: 'new-pass1'})).j.error, 'auth/invalid-reset', 'توكن غلط');
  assert.strictEqual((await S.call('/api/auth/reset-token', {token, password: '123'})).j.error, 'auth/weak-password', 'كلمة سر ضعيفة');
  assert.strictEqual((await S.call('/api/auth/reset-token', {token, password: 'new-pass1'})).status, 200, 'كلمة السر اتغيّرت');
  assert.strictEqual((await S.call('/api/auth/login', {email: 'ali@farm.com', password: 'old-pass1'})).status, 401, 'القديمة بطلت');
  assert((await S.call('/api/auth/login', {email: 'ali@farm.com', password: 'new-pass1'})).j.token, 'والجديدة بتدخّل');
  assert.strictEqual((await S.call('/api/auth/reset-token', {token, password: 'another-pw1'})).j.error, 'auth/invalid-reset', 'الرابط بينفع مرة واحدة');

  // طلب جديد بيلغي اللي قبله، والطلبات المتكررة بتتحدّد (3 في الساعة للإيميل)
  await S.call('/api/auth/forgot', {email: 'ali@farm.com'}); await S.call('/api/auth/forgot', {email: 'ali@farm.com'});
  const lim = await S.call('/api/auth/forgot', {email: 'ali@farm.com'});
  assert.deepStrictEqual([lim.status, lim.j.error], [429, 'auth/too-many-requests'], 'الطلب الرابع في الساعة بيتحدّد');

  S.close(); smtp.srv.close();
  console.log('local-mail OK');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
