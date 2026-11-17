/* O'Roots — المهام المجدولة على السيرفر المحلي:
   - إشعارات الموبايل: أول ما يتعمل إشعار جديد (ومراجعة كل 5 دقايق)
   - التذكيرات وملخص الصبح والقراءات الناقصة: كل ساعة (نفس سكربت GitHub Actions)
   - نسخة احتياطية يومية من الداتا كلها في فولدر backups (ولو فيه backupPassphrase بتتشفّر)
   - المراقبة: كل ساعة بيشوف المساحة الفاضية وآخر نسخة احتياطية، ولو فيه مشكلة بيبعت إشعار للمدير (مرة في اليوم لكل مشكلة) */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const W = require('./webpush');
const {adminDb, messaging} = require('./admin-adapter');
const ROOT = path.resolve(__dirname, '..');

function vapidKeys(store){
  let v = store.kvGet('vapid');
  if(!v){ v = W.generateVapid(); store.kvSet('vapid', v); }
  return v;
}
function backupNow(app){
  const {store, cfg} = app, d = new Date(), day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  fs.mkdirSync(cfg.backupDir, {recursive: true});
  const data = store.exportAll();
  let file;
  if(cfg.backupPassphrase){
    const {encrypt} = require(path.join(ROOT, 'backup-firestore.js'));
    file = path.join(cfg.backupDir, 'oroots-' + day + '.json.gz.enc'); fs.writeFileSync(file, encrypt(data, cfg.backupPassphrase));
  } else {
    file = path.join(cfg.backupDir, 'oroots-' + day + '.json.gz'); fs.writeFileSync(file, zlib.gzipSync(Buffer.from(JSON.stringify(data), 'utf8')));
  }
  const keep = Math.max(3, Number(cfg.keepBackups) || 30);
  fs.readdirSync(cfg.backupDir).filter(f => /^oroots-\d{4}-\d{2}-\d{2}\.json\.gz(\.enc)?$/.test(f)).sort().reverse().slice(keep).forEach(f => { try{ fs.unlinkSync(path.join(cfg.backupDir, f)); }catch(e){} });
  store.kvSet('lastBackup', {day, file, at: Date.now()});
  store.kvSet('backupError', null);
  console.log('نسخة احتياطية:', file);
  return file;
}
/* ---------- المراقبة ---------- */
function freeMB(dir){
  try{ const s = fs.statfsSync(dir); return Math.round(Number(s.bavail) * Number(s.bsize) / 1048576); }catch(e){ return null; }
}
/* بيرجّع المشاكل الحالية: [{code, title, body}] */
function healthIssues(app, now){
  const {store, cfg} = app; now = now || Date.now();
  const out = [], minMB = Number(cfg.minFreeMB) || 2048;
  const dirs = [cfg.dataDir, cfg.backupDir].filter(d => d && fs.existsSync(d));
  const free = dirs.map(freeMB).filter(x => x != null), low = free.length ? Math.min.apply(null, free) : null;
  if(low != null && low < minMB) out.push({code: 'disk', free: low, title: '⚠️ المساحة على جهاز السيرفر قربت تخلص',
    body: 'فاضل ' + low + ' ميجا بس على الهارد. امسح حاجات مش محتاجها أو انقل النسخ الاحتياطية لهارد تاني.'});
  if(cfg.jobs !== false){
    const lb = store.kvGet('lastBackup'), err = store.kvGet('backupError');
    const since = lb ? lb.at : (app.startedAt || now), ageH = Math.floor((now - since) / 3600000);
    if(err && (!lb || err.at > lb.at)) out.push({code: 'backup-failed', title: '⚠️ النسخة الاحتياطية فشلت',
      body: 'النسخة الاحتياطية اليومية ما اتعملتش: ' + String(err.msg || '').slice(0, 160) + ' — راجع فولدر النسخ الاحتياطية والمساحة.'});
    else if(ageH >= 36) out.push({code: 'backup-old', title: '⚠️ مفيش نسخة احتياطية جديدة',
      body: 'آخر نسخة احتياطية من ' + ageH + ' ساعة. اتأكد إن السيرفر شغال وإن فولدر النسخ موجود.'});
  }
  return out;
}
function healthSummary(app, now){
  const {store, cfg} = app, lb = store.kvGet('lastBackup'), issues = healthIssues(app, now);
  const dirs = [cfg.dataDir, cfg.backupDir].filter(d => d && fs.existsSync(d)), free = dirs.map(freeMB).filter(x => x != null);
  return {ok: !issues.length, issues: issues.map(i => i.code), freeMB: free.length ? Math.min.apply(null, free) : null,
    lastBackup: lb ? lb.day : null, backupAgeH: lb ? Math.floor(((now || Date.now()) - lb.at) / 3600000) : null};
}
/* إشعار لكل المديرين (مرة في اليوم لكل نوع مشكلة) */
function alertAdmins(app, issues, now){
  const {store, cfg} = app; now = now || Date.now();
  const day = todayLocal(new Date(now)), sent = store.kvGet('alertsSent') || {}, fresh = issues.filter(i => sent[i.code] !== day);
  if(!fresh.length) return 0;
  const admins = new Set(store.query('roles', [], [], 0).filter(d => d.data && d.data.role === 'admin').map(d => String(d.id).toLowerCase()));
  if(cfg.adminEmail) admins.add(String(cfg.adminEmail).toLowerCase());
  const writes = [];
  fresh.forEach(i => { sent[i.code] = day; admins.forEach(to => {
    const id = 'sys-' + i.code + '-' + day + '-' + to.replace(/[^a-z0-9]/g, '');
    writes.push({op: 'set', path: 'notifications/' + id, data: {id, to, kind: 'msg', title: i.title, body: i.body, from: 'system', fromName: "O'Roots", createdAt: now, read: false}});
  }); });
  store.kvSet('alertsSent', sent);
  if(writes.length) store.commit(writes);
  return writes.length;
}
function checkHealth(app, now){
  const issues = healthIssues(app, now);
  if(issues.length){ console.error('تنبيه مراقبة:', issues.map(i => i.code).join(', ')); try{ alertAdmins(app, issues, now); }catch(e){ console.error('تنبيه المراقبة ما اتبعتش:', e.message); } }
  return issues;
}
function start(app){
  const {store, cfg, hooks} = app, v = vapidKeys(store);
  hooks.vapidPublic = v.publicKey;
  app.startedAt = app.startedAt || Date.now();
  hooks.health = now => healthSummary(app, now);
  if(cfg.jobs === false) return;
  const db = adminDb(store), msg = messaging(store, v, 'mailto:' + (cfg.adminEmail || 'admin@oroots.local'));
  const appUrl = cfg.appUrl || '';
  let N = null, R = null; try{ N = require(path.join(ROOT, 'send-notifications.js')); R = require(path.join(ROOT, 'send-reminders.js')); }catch(e){ console.error('سكربتات الإشعارات مش موجودة جنب السيرفر:', e.message); }

  let busyN = false, timerN = null;
  const runNotifications = async () => {
    if(!N || busyN) return; busyN = true;
    try{ const s = await N.run({db, messaging: msg, now: Date.now(), appUrl: appUrl || undefined}); if(s.users) console.log('إشعارات:', JSON.stringify(s)); }
    catch(e){ console.error('إشعارات فشلت:', e.message); } finally{ busyN = false; }
  };
  hooks.onCommit.push(changes => {
    if(changes.some(c => c.coll === 'notifications' && !c.before && c.after)){ clearTimeout(timerN); timerN = setTimeout(runNotifications, 2000); }
  });
  setInterval(runNotifications, 5 * 60000).unref();

  let lastHour = -1;
  setInterval(async () => {
    const d = new Date(), h = d.getHours();
    if(d.getMinutes() < 2 || h === lastHour) return;   // مرة كل ساعة (بعد دقيقتين من أول الساعة)
    lastHour = h;
    if(R){ try{ await R.runAll({db, messaging: msg, date: d}); }catch(e){ console.error('التذكيرات فشلت:', e.message); } }
    const lb = store.kvGet('lastBackup');
    if(h >= (Number(cfg.backupHour) || 2) && (!lb || String(lb.day) < todayLocal(d))){
      try{ backupNow(app); }catch(e){ console.error('النسخة الاحتياطية فشلت:', e.message); store.kvSet('backupError', {at: Date.now(), msg: e.message}); }
    }
    checkHealth(app);
  }, 60000).unref();
}
function todayLocal(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
module.exports = {start, backupNow, vapidKeys, healthIssues, healthSummary, alertAdmins, checkHealth};
