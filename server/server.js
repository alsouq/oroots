/* O'Roots — السيرفر المحلي (بديل Firebase): بيشغّل التطبيق + الداتا + تسجيل الدخول + التحديث اللحظي + إشعارات الموبايل.
   التشغيل:  node server/server.js            (Node 22.13+ أو 24 LTS)
   الإعدادات: server/config.json (لو مش موجود بيستخدم الافتراضي). شوف server/README-AR.md */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
process.removeAllListeners('warning');   // تحذير "SQLite experimental" بس
const {Store} = require('./store');
const {Auth, randomPw} = require('./auth');
const {makeRules} = require('./rules');
const mail = require('./mail');

const ROOT = __dirname;
function loadConfig(){
  const def = {port: 8080, host: '0.0.0.0', dataDir: 'data', publicDir: 'public', adminEmail: 'dragoncool3330@gmail.com', appUrl: '', backupDir: 'backups', backupHour: 2, keepBackups: 30, jobs: true};
  let c = {}; try{ c = JSON.parse(fs.readFileSync(process.env.OROOTS_CONFIG || path.join(ROOT, 'config.json'), 'utf8').replace(/^\uFEFF/, '')); }catch(e){ if(e.code !== 'ENOENT') throw new Error('ملف config.json فيه غلطة (اتأكد من الفواصل وعلامات "" والـ / بدل \\): ' + e.message); }
  const cfg = Object.assign(def, c);
  ['dataDir', 'publicDir', 'backupDir'].forEach(k => { cfg[k] = path.resolve(ROOT, cfg[k]); });
  if(process.env.PORT) cfg.port = Number(process.env.PORT);
  return cfg;
}
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8'};

/* عنوان جهاز اللي بيسجّل دخول (عشان إيقاف التخمين يقفل على المخمّن بس، مش على الحساب للكل):
   لما الطلب جاي من نفس الكمبيوتر — يعني عن طريق Tailscale Funnel أو Cloudflare — بناخد العنوان الحقيقي من الهيدر اللي بيحطه.
   أي طلب تاني (من الشبكة المحلية) بنتجاهل الهيدرات دي عشان محدش يزوّرها. */
function clientIp(req){
  const ra = String(req.socket.remoteAddress || '');
  if(!/^(127\.|::1$|::ffff:127\.)/.test(ra)) return ra;
  const cf = req.headers['cf-connecting-ip']; if(cf) return String(cf).trim();
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : ra;
}

function createServer(cfg){
  const store = new Store(cfg.dataDir), auth = new Auth(store), rules = makeRules(store, cfg.adminEmail);
  const sse = new Set();   // {res, user}
  const hooks = {onCommit: []};

  // أول تشغيل: حساب المدير بكلمة سر مؤقتة (مكتوبة في data/first-admin.txt)
  if(!auth.list().length && cfg.adminEmail){
    const pw = randomPw(); auth.setPassword(cfg.adminEmail, pw, true);
    fs.writeFileSync(path.join(cfg.dataDir, 'first-admin.txt'), 'المدير: ' + cfg.adminEmail + '\nكلمة السر المؤقتة: ' + pw + '\n');
    console.log('حساب المدير اتعمل: ' + cfg.adminEmail + ' — كلمة السر في ' + path.join(cfg.dataDir, 'first-admin.txt'));
  }

  function send(res, code, obj, headers){
    let body = Buffer.from(JSON.stringify(obj));
    const h = Object.assign({'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Accept-Encoding'}, headers || {});
    if(res.__gzip && body.length > 4096){ body = zlib.gzipSync(body, {level: 6}); h['Content-Encoding'] = 'gzip'; }   // القراءات الكبيرة: أقل استهلاك لباقة الموبايل
    h['Content-Length'] = body.length;
    res.writeHead(code, h);
    res.end(body);
  }
  function fail(res, e){
    const code = e.status || 500; if(code >= 500) console.error(e);
    send(res, code, {error: e.code || (code === 403 ? 'permission-denied' : 'internal'), message: code >= 500 ? 'internal' : e.message});
  }
  function readBody(req){
    return new Promise((ok, bad) => {
      let n = 0; const chunks = [];
      req.on('data', c => { n += c.length; if(n > 20 * 1024 * 1024){ bad(Object.assign(new Error('too large'), {status: 413})); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { try{ ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }catch(e){ bad(Object.assign(new Error('bad json'), {status: 400})); } });
      req.on('error', bad);
    });
  }
  function userOf(req, url){
    const h = req.headers.authorization || '', t = h.startsWith('Bearer ') ? h.slice(7) : (url && url.searchParams.get('token'));
    return auth.check(t);
  }
  const denied = () => Object.assign(new Error('permission-denied'), {status: 403, code: 'permission-denied'});
  const need = u => { if(!u) throw Object.assign(new Error('unauthenticated'), {status: 401, code: 'unauthenticated'}); return u; };

  /* تحديث لحظي: بعد أي كتابة بنبلّغ كل متصفح مفتوح بالمسارات اللي اتغيّرت (لو من حقه يقراها) */
  store.onChange(changes => {
    for(const cl of sse){
      const vis = changes.filter(c => rules.canRead(cl.user, c.coll, c.id, c.after || c.before)).map(c => ({p: c.path, c: c.coll}));
      if(vis.length) cl.res.write('data: ' + JSON.stringify(vis) + '\n\n');
    }
    hooks.onCommit.forEach(fn => { try{ fn(changes); }catch(e){ console.error(e); } });
  });
  setInterval(() => { for(const cl of sse) cl.res.write(': ping\n\n'); }, 25000).unref();

  const api = {
    'POST /api/auth/login': async (req, res, b) => { const r = auth.login(b.email, b.password, clientIp(req)); send(res, 200, r); },
    'POST /api/auth/logout': async (req, res) => { const h = req.headers.authorization || ''; auth.logout(h.slice(7)); send(res, 200, {ok: true}); },
    'GET /api/auth/me': async (req, res, b, u) => { if(!u) return send(res, 401, {error: 'unauthenticated'}); send(res, 200, {email: u.email, mustChange: auth.mustChange(u.email)}); },
    'POST /api/auth/create': async (req, res, b, u) => { need(u); if(!rules.isAdmin(u)) throw denied(); auth.create(b.email, b.password); send(res, 200, {ok: true}); },
    'POST /api/auth/reset': async (req, res, b, u) => {
      // مفيش إيميل على السيرفر المحلي: المدير بس بيعمل كلمة سر مؤقتة ويديها للموظف
      if(!u || !rules.isAdmin(u)) throw Object.assign(new Error('auth/local-reset'), {status: 403, code: 'auth/local-reset'});
      const pw = randomPw(); auth.setPassword(b.email, pw, true); send(res, 200, {tempPassword: pw});
    },
    /* «نسيت كلمة المرور»: رابط بيتبعت على الإيميل (جيميل). الرد واحد سواء الإيميل مسجّل أو لأ (عشان محدش يعرف مين عندنا حساب) */
    'POST /api/auth/forgot': async (req, res, b) => {
      if(!mail.configured(cfg.mail) || !/^https?:\/\//.test(String(cfg.appUrl || ''))) throw Object.assign(new Error('auth/mail-not-configured'), {status: 503, code: 'auth/mail-not-configured'});
      const email = auth.norm(b.email);
      if(!/^[^@\s]+@[^@\s]+$/.test(email)) throw Object.assign(new Error('auth/invalid-email'), {status: 400, code: 'auth/invalid-email'});
      if(!auth.askLimit('e|' + email, 3) || !auth.askLimit('i|' + clientIp(req), 10)) throw Object.assign(new Error('auth/too-many-requests'), {status: 429, code: 'auth/too-many-requests'});
      if(auth.exists(email)){
        const link = String(cfg.appUrl).replace(/\/+$/, '') + '/#reset=' + auth.createReset(email);
        mail.send(cfg.mail, {to: email, subject: "إعادة تعيين كلمة المرور — O'Roots", text:
          "أهلاً،\n\nوصلنا طلب لتغيير كلمة المرور لحسابك في O'Roots.\nاضغط على الرابط ده واختار كلمة مرور جديدة (الرابط صالح لمدة ساعة ولمرة واحدة):\n\n" + link +
          "\n\nلو إنت ما طلبتش ده، تجاهل الرسالة وكلمة المرور الحالية هتفضل زي ما هي.\n"}).catch(e => console.error('إيميل «نسيت كلمة المرور» ما اتبعتش:', e.message));
      }
      send(res, 200, {ok: true});
    },
    'POST /api/auth/reset-token': async (req, res, b) => {
      if(!auth.askLimit('r|' + clientIp(req), 20)) throw Object.assign(new Error('auth/too-many-requests'), {status: 429, code: 'auth/too-many-requests'});
      auth.useReset(b.token, b.password); send(res, 200, {ok: true});
    },
    'POST /api/auth/password': async (req, res, b, u) => {
      need(u);
      if(!auth.mustChange(u.email)) auth.login(u.email, b.oldPassword, clientIp(req));   // بيرمي خطأ لو القديمة غلط (كلمة السر المؤقتة بتتغيّر من غير القديمة)
      auth.setPassword(u.email, b.newPassword, false); send(res, 200, auth.login(u.email, b.newPassword));
    },
    'POST /api/db/get': async (req, res, b, u) => {
      need(u); const sp = Store.split(b.path), d = store.get(sp.path);
      if(!rules.canRead(u, sp.coll, sp.id, d && d.data)) throw denied();
      send(res, 200, d ? {exists: true, id: d.id, data: d.data, ver: d.ver} : {exists: false, id: sp.id, ver: 0});
    },
    'POST /api/db/query': async (req, res, b, u) => {
      need(u);
      const docs = store.query(String(b.coll || ''), b.where || [], b.orderBy || [], Number(b.limit) || 0).filter(d => rules.canRead(u, String(b.coll), d.id, d.data));
      send(res, 200, {docs: docs.map(d => ({id: d.id, data: d.data, ver: d.ver}))});
    },
    'POST /api/db/commit': async (req, res, b, u) => {
      need(u); const writes = Array.isArray(b.writes) ? b.writes : [], reads = Array.isArray(b.reads) ? b.reads : [];
      if(writes.length > 500) throw Object.assign(new Error('too many writes'), {status: 400});
      const preview = store.preview(writes);
      for(const c of preview){ if(!rules.canWrite(u, c)) throw denied(); }
      for(const r of reads){ const sp = Store.split(r.path), d = store.get(sp.path); if(!rules.canRead(u, sp.coll, sp.id, d && d.data)) throw denied(); }
      store.commit(writes, reads); send(res, 200, {ok: true});
    },
    'GET /api/events': async (req, res, b, u) => {
      need(u);
      res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'});
      res.write('retry: 3000\n\n'); const cl = {res, user: u}; sse.add(cl);
      req.on('close', () => sse.delete(cl));
    },
    'GET /api/push/key': async (req, res) => { send(res, 200, {publicKey: hooks.vapidPublic || ''}); },
    'POST /api/push/register': async (req, res, b, u) => {
      need(u); if(!b.token || !b.subscription || !b.subscription.endpoint) throw Object.assign(new Error('bad'), {status: 400});
      store.kvSet('push:' + b.token, {email: u.email, sub: b.subscription, at: Date.now()}); send(res, 200, {ok: true});
    },
    // للمراقبة (UptimeRobot وغيره): 200 لو كله تمام، 503 لو السيرفر شغال بس فيه مشكلة (مساحة / نسخة احتياطية)
    'GET /api/health': async (req, res) => {
      const h = hooks.health ? hooks.health() : {ok: true, issues: []};
      send(res, h.ok ? 200 : 503, Object.assign({docs: store.docs.size, clients: sse.size}, h));
    }
  };
  // المحلّل الذكي (server/ai)
  Object.assign(api, require('./ai').routes({store, rules, send, need}));
  // الحساسات (server/sensors.js): حالة كل حساس لكارت الإعدادات
  Object.assign(api, require('./sensors').routes({hooks, rules, send, need}));

  /* الملفات: ETag (لو الملف ما اتغيّرش الموبايل ما بينزّلوش تاني) + ضغط br/gzip (الصفحة 1.5 ميجا بتبقى حوالي ربعها) */
  const packed = new Map();   // file → {tag, gz, br}
  const COMPRESS = /\.(html|js|json|css|svg|txt|webmanifest)$/;
  function serveStatic(req, res, url){
    let p = decodeURIComponent(url.pathname); if(p.endsWith('/')) p += 'index.html';
    const file = path.join(cfg.publicDir, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
    if(!file.startsWith(cfg.publicDir)){ res.writeHead(403); return res.end(); }
    fs.stat(file, (err, st) => {
      if(err || !st.isFile()){ res.writeHead(404, {'Content-Type': 'text/plain'}); return res.end('not found'); }
      const ext = path.extname(file).toLowerCase(), noCache = ext === '.html' || /sw\.js$/.test(file) || /local-firebase\.js$/.test(file);
      const tag = 'W/"' + st.size.toString(36) + '-' + Math.round(st.mtimeMs).toString(36) + '"';
      const h = {'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': noCache ? 'no-cache' : 'public, max-age=3600', 'ETag': tag, 'Last-Modified': st.mtime.toUTCString(), 'Vary': 'Accept-Encoding',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'"};
      if(String(req.headers['if-none-match'] || '').split(/\s*,\s*/).indexOf(tag) >= 0){ res.writeHead(304, h); return res.end(); }
      const ae = String(req.headers['accept-encoding'] || ''), enc = !COMPRESS.test(file) || st.size < 1024 ? '' : /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : '';
      if(!enc){ h['Content-Length'] = st.size; res.writeHead(200, h); return req.method === 'HEAD' ? res.end() : fs.createReadStream(file).pipe(res); }
      let c = packed.get(file);
      if(!c || c.tag !== tag){ const raw = fs.readFileSync(file); c = {tag, raw}; packed.set(file, c); }
      if(!c[enc]) c[enc] = enc === 'br' ? zlib.brotliCompressSync(c.raw, {params: {[zlib.constants.BROTLI_PARAM_QUALITY]: 9}}) : zlib.gzipSync(c.raw, {level: 9});
      h['Content-Encoding'] = enc; h['Content-Length'] = c[enc].length;
      res.writeHead(200, h); res.end(req.method === 'HEAD' ? undefined : c[enc]);
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    res.__gzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    if(url.pathname.startsWith('/api/')){
      const fn = api[req.method + ' ' + url.pathname];
      if(!fn) return send(res, 404, {error: 'not-found'});
      try{
        const body = req.method === 'POST' ? await readBody(req) : {};
        await fn(req, res, body, userOf(req, url.pathname === '/api/events' ? url : null));
      }catch(e){ if(!res.headersSent) fail(res, e); else try{ res.end(); }catch(x){} }
      return;
    }
    if(req.method !== 'GET' && req.method !== 'HEAD'){ res.writeHead(405); return res.end(); }
    serveStatic(req, res, url);
  });
  return {server, store, auth, rules, hooks, cfg, sse};
}

if(require.main === module){
  const cfg = loadConfig();
  // بيجهّز نسخة التطبيق (server/public) من index.html كل ما يبدأ — فبعد أي تحديث كفاية تعمل restart
  try{ require('./build').build(cfg.publicDir); }catch(e){ console.error('تجهيز نسخة التطبيق فشل (هيشتغل بالنسخة القديمة لو موجودة):', e.message); }
  const app = createServer(cfg);
  try{ require('./jobs').start(app); }catch(e){ console.error('المهام المجدولة (إشعارات/نسخ احتياطي) ما اشتغلتش:', e.message); }
  try{ require('./sensors').start(app); }catch(e){ console.error('استقبال الحساسات ما اشتغلش:', e.message); }
  try{ require('./pipes').start(app); }catch(e){ console.error('سجل المواسير ما اشتغلش:', e.message); }
  app.server.on('error', e => {
    if(e.code === 'EADDRINUSE') console.error('البورت ' + cfg.port + ' مستخدم: السيرفر شغّال بالفعل (أو برنامج تاني على نفس البورت). اقفل النسخة التانية أو غيّر port في config.json');
    else console.error(e);
    process.exit(1);
  });
  const pidFile = path.join(cfg.dataDir, 'server.pid');
  app.server.listen(cfg.port, cfg.host, () => {
    try{ fs.writeFileSync(pidFile, String(process.pid)); }catch(e){}
    console.log("O'Roots شغّال على http://localhost:" + cfg.port + ' — المستندات: ' + app.store.docs.size);
  });
  const bye = () => { try{ fs.unlinkSync(pidFile); }catch(e){} app.store.close(); process.exit(0); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}
module.exports = {createServer, loadConfig, clientIp};
