/* O'Roots — فحص سريع للسيرفر: بيقولك بالظبط ليه مش شغّال (ملف ناقص، config.json فيه غلطة، البورت مشغول، نسخة Node قديمة…).
   التشغيل:  diagnose.bat  (أو:  node server\doctor.js)  — بيكتب تقرير عربي في server\data\diagnose.txt ويفتحه.
   بيتشغّل لوحده كمان قبل ما السيرفر يبدأ، فأي غلطة بتتكتب في السجل بدل ما السيرفر يقع من غير تفسير. */
'use strict';
const fs = require('fs'), path = require('path'), net = require('net'), http = require('http'), {spawnSync} = require('child_process');
const ROOT = path.resolve(__dirname, '..');

/* كل الملفات اللي السيرفر والتطبيق محتاجينها (لو أي واحد ناقص = تحديث اتنسخ ناقص) */
const REQUIRED = [
  'index.html', 'sw.js', 'manifest.webmanifest', 'farm-logic.js', 'cost-logic.js', 'i18n-engine.js', 'hb-engine.js', 'hb-data.js', 'push-i18n.js', 'cooling-sim.js',
  'vendor/three.min.js', 'i18n/en.json',
  'server/server.js', 'server/doctor.js', 'server/store.js', 'server/auth.js', 'server/rules.js', 'server/mail.js', 'server/build.js', 'server/jobs.js', 'server/sensors.js', 'server/pipes.js',
  'server/admin-adapter.js', 'server/webpush.js', 'server/local-firebase.js', 'server/import.js', 'server/reset-password.js',
  'server/ai/index.js', 'server/ai/claude.js', 'server/ai/openai.js', 'server/ai/prompts.js'
];
const missingFiles = () => REQUIRED.filter(f => !fs.existsSync(path.join(ROOT, f)));

function configPath(){ return process.env.OROOTS_CONFIG || path.join(__dirname, 'config.json'); }
/* غلطة JSON بمكانها: السطر والعمود والسطر نفسه */
function jsonProblem(text, e){
  const m = /position (\d+)/.exec(e.message), pos = m ? Number(m[1]) : -1;
  if(pos < 0) return e.message;
  const before = text.slice(0, pos), line = before.split('\n').length, col = pos - before.lastIndexOf('\n'), src = (text.split('\n')[line - 1] || '').trim().slice(0, 120);
  return 'سطر ' + line + ' عمود ' + col + ' → «' + src + '»  (' + e.message.replace(/ in JSON at position \d+.*$/, '') + ')';
}

function checkConfig(){
  const out = [], p = configPath();
  let text; try{ text = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''); }catch(e){
    out.push(['warn', 'مفيش ملف config.json (' + p + '): السيرفر هيشتغل بالإعدادات الافتراضية.', 'config.json not found (' + p + '): the server would use defaults.']); return {out, cfg: {}};
  }
  let cfg; try{ cfg = JSON.parse(text); }catch(e){
    out.push(['fail', 'ملف config.json فيه غلطة: ' + jsonProblem(text, e), 'config.json has a syntax error: ' + e.message]);
    out.push(['info', 'الأخطاء الشائعة: فاصلة ناقصة بين سطرين أو زيادة بعد آخر سطر، أو علامة " ناقصة، أو مسار فيه \\ واحدة (اكتبه C:/Users/... أو C:\\\\Users\\\\...).', 'Common causes: missing comma between lines, extra comma after the last line, missing quote, or a single backslash in a path (use / or \\\\).']);
    return {out, cfg: null};
  }
  out.push(['ok', 'ملف config.json سليم.', 'config.json is valid.']);
  if(cfg.port != null && !(Number(cfg.port) > 0 && Number(cfg.port) < 65536)) out.push(['fail', 'port لازم يكون رقم (مثلًا 8080).', 'port must be a number (e.g. 8080).']);
  if(cfg.appUrl){
    if(!/^https?:\/\/[^\s/]+/.test(cfg.appUrl)) out.push(['fail', 'appUrl لازم يبدأ بـ https:// (مثلًا https://farm-pc.tail1234.ts.net).', 'appUrl must start with https://']);
    else if(/\/$/.test(cfg.appUrl)) out.push(['warn', 'appUrl فيه / في الآخر، شيلها.', 'appUrl has a trailing slash; remove it.']);
    else if(/tailXXXX|اسم-الجهاز|example\.com/.test(cfg.appUrl)) out.push(['fail', 'appUrl لسه فيه القيمة المثال، اكتب رابط النظام الحقيقي.', 'appUrl still has the example value.']);
  }
  if(cfg.mail){
    const m = cfg.mail, miss = ['host', 'user', 'pass'].filter(k => !m[k]);
    if(miss.length) out.push(['fail', 'قسم mail ناقص: ' + miss.join(', '), 'mail section is missing: ' + miss.join(', ')]);
    else if(/xxxx|حسابك|your-farm/i.test(m.pass + m.user)) out.push(['fail', 'قسم mail لسه فيه القيم المثال (الإيميل أو كلمة مرور التطبيق).', 'mail section still has example values.']);
    else out.push(['ok', 'إعداد الإيميل («نسيت كلمة المرور») مكتوب.' + (cfg.appUrl ? '' : ' بس لازم appUrl كمان.'), 'Mail settings present.' + (cfg.appUrl ? '' : ' appUrl is also required.')]);
  }
  if(cfg.dataDir){ const d = path.resolve(__dirname, cfg.dataDir); if(!fs.existsSync(d)) out.push(['warn', 'dataDir مش موجود (' + d + ') وهيتعمل جديد وفاضي. لو ده مش المقصود راجع المسار.', 'dataDir does not exist (' + d + '): a NEW EMPTY database would be created. Check the path.']); }
  if(cfg.backupDir){ const d = path.resolve(__dirname, cfg.backupDir); if(!fs.existsSync(d)) out.push(['warn', 'فولدر النسخ الاحتياطي مش موجود: ' + d, 'backupDir does not exist: ' + d]); }
  return {out, cfg};
}

function portState(port, host){
  return new Promise(res => {
    const s = net.createServer(); s.once('error', e => res(e.code === 'EADDRINUSE' ? 'busy' : 'error:' + e.code));
    s.listen(port, host || '0.0.0.0', () => s.close(() => res('free')));
  });
}
function health(port){
  return new Promise(res => { const r = http.get({host: '127.0.0.1', port, path: '/api/health', timeout: 2500}, x => { let b = ''; x.on('data', d => b += d); x.on('end', () => res({status: x.statusCode, body: b})); }); r.on('error', () => res(null)); r.on('timeout', () => { r.destroy(); res(null); }); });
}

async function run(opts){
  opts = opts || {}; const lines = [], add = (k, t, en) => lines.push([k, t, en]);
  // Node
  const major = Number(process.versions.node.split('.')[0]), minor = Number(process.versions.node.split('.')[1]);
  if(major < 22 || (major === 22 && minor < 13)) add('fail', 'نسخة Node ' + process.versions.node + ' قديمة. لازم 22.13 أو أحدث (يفضّل LTS من nodejs.org).', 'Node ' + process.versions.node + ' is too old; need 22.13 or newer.');
  else add('ok', 'Node ' + process.versions.node + '.', 'Node ' + process.versions.node + '.');
  try{ require('node:sqlite'); add('ok', 'مكتبة قاعدة البيانات (sqlite) شغّالة.', 'sqlite is available.'); }catch(e){ add('fail', 'مكتبة sqlite مش شغّالة في نسخة Node دي: ' + e.message, 'sqlite is not available in this Node: ' + e.message); }
  // الملفات
  const miss = missingFiles();
  if(miss.length) add('fail', 'ملفات ناقصة (' + miss.length + '): ' + miss.join(' ، ') + '\n   الحل: فك الزيب الكامل (oroots-full-update-…) فوق فولدر oroots كله، أو شغّل server\\update.bat.', 'MISSING FILES (' + miss.length + '): ' + miss.join(', ') + ' - unzip the full package over the oroots folder, or run server\\update.bat.');
  else add('ok', 'كل ملفات البرنامج موجودة (' + REQUIRED.length + ').', 'All ' + REQUIRED.length + ' program files are present.');
  // الإعدادات
  const c = checkConfig(); c.out.forEach(x => lines.push(x));
  const cfg = c.cfg || {}, port = Number(cfg.port) || 8080;
  // البورت
  if(c.cfg !== null){
    const st = await portState(port, cfg.host);
    if(st === 'busy'){
      const h = await health(port);
      const up = h && h.status === 200;
      add(up ? 'ok' : 'warn', up ? 'السيرفر شغّال دلوقتي على بورت ' + port + ' (' + h.body.slice(0, 80) + ').' : 'بورت ' + port + ' مشغول ببرنامج تاني (أو نسخة قديمة من السيرفر مش بترد). اقفل نافذة السيرفر القديمة أو شغّل server\\stop-server.bat.', up ? 'The server is running on port ' + port + '.' : 'Port ' + port + ' is used by another program (or a stuck old server). Close the old server window or run server\\stop-server.bat.');
    } else if(st === 'free') add('info', 'بورت ' + port + ' فاضي (السيرفر مش شغّال دلوقتي).', 'Port ' + port + ' is free (the server is not running now).');
    else add('warn', 'مش قادر أفحص البورت ' + port + ': ' + st, 'Cannot check port ' + port + ': ' + st);
  }
  // الداتا
  const dd = path.resolve(__dirname, cfg.dataDir || 'data');
  try{ if(!fs.existsSync(dd)) throw new Error('not found'); fs.accessSync(dd, fs.constants.W_OK); add('ok', 'فولدر الداتا (' + dd + ') موجود وقابل للكتابة.', 'Data folder is writable: ' + dd); }catch(e){ add('fail', 'فولدر الداتا (' + dd + ') مش قابل للكتابة: ' + e.message, 'Data folder is not writable: ' + dd + ' ' + e.message); }
  // آخر السجل
  try{
    const log = fs.readFileSync(path.join(dd, 'server.log'), 'utf8').trim().split('\n').slice(-14);
    if(log.length && log[0]) add('info', 'آخر سطور من server.log:\n   ' + log.join('\n   '), 'Last lines of server.log:\n   ' + log.join('\n   '));
  }catch(e){}
  // المهمة المجدولة (ويندوز)
  if(process.platform === 'win32'){
    const r = spawnSync('schtasks', ['/Query', '/TN', 'ORoots Server', '/FO', 'LIST'], {encoding: 'utf8'});
    if(r.status === 0){ const m = /Status:\s*(.+)/i.exec(r.stdout || ''); add('info', 'المهمة المجدولة «ORoots Server»: ' + (m ? m[1].trim() : 'موجودة') + '.', 'Scheduled task "ORoots Server": ' + (m ? m[1].trim() : 'exists') + '.'); }
    else add('warn', 'المهمة المجدولة «ORoots Server» مش متسطّبة (السيرفر مش هيقوم لوحده مع الويندوز). شغّل server\\install-autostart.bat كمسؤول.', 'The scheduled task "ORoots Server" is not installed (the server will not start with Windows). Run server\\install-autostart.bat as administrator.');
  }
  const bad = lines.filter(l => l[0] === 'fail').length, warn = lines.filter(l => l[0] === 'warn').length;
  const sym = {ok: '✔', warn: '⚠', fail: '✖', info: '•'};
  const text = "تقرير فحص O'Roots — " + new Date().toLocaleString('en-GB') + '\nالمجلد: ' + ROOT + '\n\n' + lines.map(l => sym[l[0]] + ' ' + l[1]).join('\n') + '\n\n' +
    (bad ? '❌ فيه ' + bad + ' مشكلة لازم تتصلّح قبل ما السيرفر يشتغل (اللي عليها ✖). ابعت الملف ده كله للمطوّر لو محتاج مساعدة.' : (warn ? '⚠ مفيش مشاكل قاتلة، بس فيه ' + warn + ' تنبيه.' : '✅ كله تمام.')) + '\n';
  if(!opts.noWrite){ try{ fs.writeFileSync(path.join(fs.existsSync(dd) ? dd : __dirname, 'diagnose.txt'), '\uFEFF' + text, 'utf8'); }catch(e){} }
  return {bad, warn, lines, text};
}
module.exports = {run, missingFiles, REQUIRED, checkConfig, jsonProblem};

if(require.main === module){
  run({}).then(r => {
    // الكونسول بالإنجليزي (ويندوز بيبوّظ الحروف العربي)، والتقرير العربي في الملف
    const en = {ok: 'OK  ', warn: 'WARN', fail: 'FAIL', info: 'info'};
    r.lines.forEach(l => console.log('[' + en[l[0]] + '] ' + (l[2] || l[1])));
    console.log(r.bad ? '\n' + r.bad + ' PROBLEM(S) FOUND - open server\\data\\diagnose.txt for details (Arabic).' : (r.warn ? '\n' + r.warn + ' warning(s) - see server\\data\\diagnose.txt.' : '\nAll good.'));
    process.exit(r.bad ? 2 : 0);
  });
}
