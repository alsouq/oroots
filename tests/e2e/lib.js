/* أدوات مشتركة لاختبارات المتصفح (E2E) على السيرفر المحلي.
   كل اختبار بيشغّل سيرفر جديد في فولدر مؤقت ببيانات تجريبية، ويفتح متصفح Chromium (Playwright)، وبيمسح كل حاجة في الآخر.
   محتاج: npm i -D playwright && npx playwright install chromium   (مرة واحدة) */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net'), {execFileSync, spawn} = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
let chromium = null;
try{ ({chromium} = require('playwright')); }catch(e){}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const NEW_PW = 'NewPass123';
const dd = n => { const d = new Date(Date.now() + n * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };   // تاريخ محلي زي todayStr في التطبيق

function freePort(){
  return new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
}

/* سيرفر ببيانات seed (نفس شكل ملف import.js) */
async function startServer(seed, extraCfg){
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'oroots-e2e-'));
  const port = await freePort();
  fs.writeFileSync(path.join(T, 'seed.json'), JSON.stringify(seed));
  const cfg = Object.assign({port, host: '127.0.0.1', dataDir: path.join(T, 'data'), backupDir: path.join(T, 'backups'), adminEmail: 'boss@farm.com', jobs: false}, extraCfg || {});
  fs.writeFileSync(path.join(T, 'config.json'), JSON.stringify(cfg));
  const env = Object.assign({}, process.env, {OROOTS_CONFIG: path.join(T, 'config.json')});
  execFileSync(process.execPath, ['server/import.js', path.join(T, 'seed.json'), '--apply'], {cwd: ROOT, env, stdio: 'ignore'});
  const pws = {};
  fs.readFileSync(path.join(cfg.dataDir, 'users-passwords.csv'), 'utf8').trim().split('\n').slice(1).forEach(l => { const [e, p] = l.split(','); pws[e] = p; });
  const proc = spawn(process.execPath, ['server/server.js'], {cwd: ROOT, env, stdio: process.env.E2E_VERBOSE ? 'inherit' : 'ignore'});
  const base = 'http://127.0.0.1:' + port;
  for(let i = 0; i < 200; i++){ try{ await fetch(base + '/api/health'); break; }catch(e){ await sleep(100); } }
  const toks = {};
  const S = {base, port, dir: T, pws, cfg,
    async token(email){
      if(toks[email]) return toks[email];
      for(const pw of [S.pws[email], NEW_PW]){
        const r = await fetch(base + '/api/auth/login', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({email, password: pw})});
        if(r.status === 200) return (toks[email] = (await r.json()).token);
      }
      throw new Error('login failed for ' + email);
    },
    async api(email, url, body){
      const r = await fetch(base + url, {method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer ' + await S.token(email)}, body: JSON.stringify(body || {})});
      return {status: r.status, j: await r.json().catch(() => ({}))};
    },
    async doc(p){ return ((await S.api('boss@farm.com', '/api/db/get', {path: p})).j || {}).data || null; },
    stop(){ try{ proc.kill(); }catch(e){} try{ fs.rmSync(T, {recursive: true, force: true}); }catch(e){} }
  };
  return S;
}

/* متصفح + صفحة. lang: 'ar' | 'en' (اختيار اللغة قبل الدخول) */
async function openPage(browser, S, opts){
  opts = opts || {};
  const c = await browser.newContext({viewport: opts.viewport || {width: 430, height: 900}});
  const p = await c.newPage(), errs = [];
  p.on('dialog', d => d.accept().catch(() => {}));
  p.on('pageerror', e => errs.push(e.message));
  if(opts.lang) await p.addInitScript(l => { try{ if(!localStorage.getItem('oroots_lang_ts')){ localStorage.setItem('oroots_lang', l); localStorage.setItem('oroots_lang_ts', String(Date.now())); } }catch(e){} }, opts.lang);
  await p.goto(S.base + '/'); await p.waitForSelector('#login-name', {state: 'visible', timeout: 20000}).catch(() => {});
  return {c, p, errs};
}
async function login(p, S, email){
  await p.fill('#login-name', email); await p.fill('#login-code', S.pws[email]);
  await p.click('#login-form button[type=submit]');
  await p.waitForFunction(() => document.querySelector('#lf-pw') || (document.querySelector('.tab-btn[data-tab="overview"]') && !document.querySelector('#login-form:not([hidden])')?.offsetParent), null, {timeout: 20000}).catch(() => {});
  await sleep(800);
  if(await p.$('#lf-pw')){
    await p.fill('#lf-pw1', NEW_PW); await p.fill('#lf-pw2', NEW_PW); await p.click('#lf-pw button[type=submit]');
    S.pws[email] = NEW_PW; await sleep(1500);
  }
  await sleep(1200);
}
const tab = async (p, t) => { await p.click('.tab-btn[data-tab="' + t + '"]'); await sleep(700); };
const sub = async (p, panel, s) => { await p.click('#panel-' + panel + ' .subtab-btn[data-subtab="' + s + '"]').catch(() => {}); await sleep(500); };
const toastText = p => p.evaluate(() => [...document.querySelectorAll('.toast,#toast,.toast-item')].map(x => x.innerText).join(' | '));

/* نتايج الاختبار */
function suite(name){
  const fails = [];
  let n = 0;
  return {
    ok(cond, msg, extra){ n++; if(cond) console.log('  ✓ ' + msg); else { fails.push(msg); console.log('  ✗ ' + msg + (extra !== undefined ? '  ← ' + JSON.stringify(extra) : '')); } },
    eq(got, want, msg){ this.ok(JSON.stringify(got) === JSON.stringify(want), msg, {got, want}); },
    finish(){
      console.log((fails.length ? '✗ ' : '✓ ') + name + ': ' + (n - fails.length) + '/' + n);
      process.exitCode = fails.length ? 1 : 0;
      return !fails.length;
    }
  };
}

/* تشغيل اختبار: لو Playwright مش موجود بيتخطّى من غير ما يفشل */
function run(name, fn){
  if(!chromium){ console.log('↷ ' + name + ': متخطّى — Playwright مش متسطّب (npm i -D playwright && npx playwright install chromium)'); return; }
  const T = suite(name);
  console.log('▶ ' + name);
  let browser = null, servers = [];
  const ctx = {T, sleep, dd, login, openPage: (S, o) => openPage(browser, S, o), tab, sub, toastText,
    startServer: async (seed, cfg) => { const S = await startServer(seed, cfg); servers.push(S); return S; }};
  (async () => {
    browser = await chromium.launch();
    await fn(ctx);
  })().catch(e => { T.ok(false, 'خطأ غير متوقع: ' + (e && e.stack || e)); })
    .then(async () => { try{ if(browser) await browser.close(); }catch(e){} servers.forEach(S => S.stop()); T.finish(); });
}

/* مستخدمين وأنظمة أساسية بنستخدمهم في أغلب الاختبارات */
function baseSeed(more){
  const users = [{id: 'u1', username: 'boss@farm.com', role: 'admin', displayName: 'Boss', permissions: {}}].concat((more && more.users) || []);
  const roles = {'boss@farm.com': {role: 'admin'}};
  users.slice(1).forEach(u => { roles[u.username] = {role: u.role || 'employee', perms: u.permissions || {}}; });
  const seed = {collections: Object.assign({
    settings: Object.assign({users: {list: users}, systems: {list: [{id: 'S1', greenhouse: 'LG1', name: 'S1'}, {id: 'S2', greenhouse: 'FG1', name: 'T1', gtype: 'fruit'}]}}, (more && more.settings) || {}),
    roles}, (more && more.collections) || {})};
  return seed;
}

module.exports = {run, baseSeed, dd, sleep, ROOT, NEW_PW};
