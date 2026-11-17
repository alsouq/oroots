/* O'Roots — نقل الداتا من Firebase للسيرفر المحلي (مرة واحدة).
   الاستخدام (السيرفر لازم يكون مقفول وإنت بتنقل):
     node server/import.js <ملف النسخة>            ← تجربة: بيعرض اللي هيتنقل من غير ما يكتب
     node server/import.js <ملف النسخة> --apply    ← نقل فعلي
   الملف: نسخة GitHub Actions المشفّرة (oroots-YYYY-MM-DD.json.gz.enc) — حط كلمة سر النسخ في BACKUP_PASSPHRASE
          أو ملف JSON عادي ({collections:{...}}) أو .json.gz
   بعد النقل: كل موظف في «حسابات الموظفين» بيتعمله حساب بكلمة سر مؤقتة، مكتوبة في data/users-passwords.csv */
'use strict';
process.removeAllListeners('warning');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const {Store} = require('./store');
const {Auth, randomPw} = require('./auth');
const {loadConfig} = require('./server');

function readBackup(file){
  const buf = fs.readFileSync(file);
  if(buf.slice(0, 9).toString() === 'OROOTSBK1'){
    if(!process.env.BACKUP_PASSPHRASE) throw new Error('الملف مشفّر: حط كلمة سر النسخ الاحتياطي في BACKUP_PASSPHRASE');
    return require(path.join(__dirname, '..', 'backup-firestore.js')).decrypt(buf, process.env.BACKUP_PASSPHRASE);
  }
  const txt = (buf[0] === 0x1f && buf[1] === 0x8b) ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  const o = JSON.parse(txt);
  if(!o || typeof o.collections !== 'object') throw new Error('الملف مش نسخة O\'Roots (مفيهوش collections)');
  return o;
}
/* Timestamp بتاع Firestore بيطلع في النسخة كـ {_seconds, _nanoseconds}: بنحوّله لمللي ثانية زي باقي التطبيق */
function fixTs(v){
  if(Array.isArray(v)) return v.map(fixTs);
  if(v && typeof v === 'object'){
    const k = Object.keys(v);
    if(k.length === 2 && '_seconds' in v && '_nanoseconds' in v) return v._seconds * 1000 + Math.round(v._nanoseconds / 1e6);
    const o = {}; k.forEach(x => { o[x] = fixTs(v[x]); }); return o;
  }
  return v;
}
/* السيرفر بيكتب رقم العملية في data/server.pid وهو شغّال — النقل والسيرفر شغّال يبوّظ الداتا اللي في الذاكرة */
function serverRunning(dataDir){
  let pid = 0; try{ pid = Number(fs.readFileSync(path.join(dataDir, 'server.pid'), 'utf8')); }catch(e){ return false; }
  if(!pid || pid === process.pid) return false;
  try{ process.kill(pid, 0); return true; }catch(e){ return e.code === 'EPERM'; }
}
function run(file, apply, cfg){
  const o = readBackup(file), plan = Object.keys(o.collections).map(c => [c, Object.keys(o.collections[c]).length]);
  const users = ((o.collections.settings || {}).users || {}).list || [];
  if(!apply) return {applied: false, plan, users: users.map(u => u.username)};
  if(serverRunning(cfg.dataDir)) throw new Error('السيرفر شغّال دلوقتي — اقفله الأول (stop-server.bat كمسؤول، أو اقفل شباك start-server) وبعدين شغّل النقل تاني.\nلو متأكد إنه مقفول امسح الملف: ' + path.join(cfg.dataDir, 'server.pid'));
  const store = new Store(cfg.dataDir), auth = new Auth(store);
  for(const c of Object.keys(o.collections)){
    const ids = Object.keys(o.collections[c]);
    for(let i = 0; i < ids.length; i += 400) store.commit(ids.slice(i, i + 400).map(id => ({op: 'set', path: c + '/' + id, data: fixTs(o.collections[c][id])})));
  }
  const rows = [['email', 'temp_password']], emails = new Set(users.map(u => String(u.username || '').toLowerCase()).filter(Boolean));
  if(cfg.adminEmail) emails.add(String(cfg.adminEmail).toLowerCase());
  for(const e of emails){
    if(auth.exists(e)) continue;
    const pw = randomPw(); auth.setPassword(e, pw, true); rows.push([e, pw]);
    if(!store.get('roles/' + e)){   // لو النسخة مفيهاش مستند الصلاحيات: من قايمة الموظفين
      const u = users.filter(x => String(x.username || '').toLowerCase() === e)[0];
      if(u) store.commit([{op: 'set', path: 'roles/' + e, data: {role: u.role || 'employee', perms: u.role === 'admin' ? {} : (u.permissions || {})}}]);
    }
  }
  const csv = path.join(cfg.dataDir, 'users-passwords.csv');
  fs.writeFileSync(csv, rows.map(r => r.join(',')).join('\n') + '\n');
  store.close();
  return {applied: true, plan, created: rows.length - 1, csv};
}
module.exports = {readBackup, fixTs, run, serverRunning};
if(require.main === module){
  const file = process.argv[2], apply = process.argv.includes('--apply');
  if(!file){ console.log('الاستخدام: node server/import.js <ملف النسخة> [--apply]'); process.exit(1); }
  try{
    const r = run(file, apply, loadConfig());
    console.log(r.applied ? 'اتنقل:' : 'تجربة بس (مفيش كتابة) — هيتنقل:');
    r.plan.forEach(([c, n]) => console.log('  ' + c + ': ' + n));
    if(r.applied) console.log('اتعمل ' + r.created + ' حساب — كلمات السر المؤقتة في: ' + r.csv + '\n(ادّي كل موظف كلمة سره، وبعدين امسح الملف)');
    else console.log('الموظفين: ' + r.users.join('، ') + '\nلو تمام شغّل نفس الأمر وزوّد --apply');
  }catch(e){ console.error('فشل:', e.message); process.exit(1); }
}
