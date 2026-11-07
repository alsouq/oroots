/* O'Roots — نسخة احتياطية من Firestore (مشفّرة) + فكّ التشفير + استرجاع
   الاستخدام:
     node backup-firestore.js backup  [--out=backups]            # بيعمل ملف مشفّر: oroots-YYYY-MM-DD.json.gz.enc
     node backup-firestore.js decrypt <ملف.enc> [--out=ملف.json]  # بيفك التشفير (لازم نفس BACKUP_PASSPHRASE)
     node backup-firestore.js restore <ملف.enc> [--apply]        # من غير --apply بيعرض بس اللي هيتكتب (جرّب الأول!)
   المتغيرات: FIREBASE_SERVICE_ACCOUNT (JSON) و BACKUP_PASSPHRASE (إجباري، 12 حرف+). مفيش نسخة بتتعمل من غير تشفير.
   تنبيه حصة: النسخة الكاملة بتقرا كل المستندات (قراءة لكل مستند) — خلّيها أسبوعية مش يومية على الخطة المجانية. */
'use strict';
const zlib = require('zlib'), crypto = require('crypto'), fs = require('fs'), path = require('path');
// كولكشنات المزرعة (نفس قايمة قواعد Firestore) + الإعدادات والصلاحيات والبيانات الخاصة. pushTokens والإشعارات مش بتتنسخ (مؤقتة وحسّاسة)
const COLLECTIONS = ['readings', 'settings', 'roles', 'userData', 'sops', 'fertilizers', 'targetProfiles', 'nutrientRecipes', 'pestlog', 'bioReleases', 'stickyTraps', 'pheromoneTraps',
  'nursery', 'irrigCalib', 'inventory', 'harvest', 'instrumentCalibrations', 'nurseryPlanLog', 'sprayPlan', 'qualityOrders', 'qualitySorting', 'qualityComplaints', 'qualityPhotos',
  'plantGrowth', 'irrigSchedules', 'costs', 'tankLog', 'handover', 'auditLog', 'trash'];
const PAGE = 1000, MAGIC = 'OROOTSBK1';

async function exportAll(db, cols = COLLECTIONS){
  const out = {app: 'oroots', version: 1, exportedAt: new Date().toISOString(), collections: {}};
  for(const c of cols){
    const docs = {}; let last = null;
    for(;;){
      let q = db.collection(c).orderBy('__name__').limit(PAGE);
      if(last) q = q.startAfter(last);
      const snap = await q.get();
      snap.docs.forEach(d => { docs[d.id] = d.data(); });
      if(snap.docs.length < PAGE) break;
      last = snap.docs[snap.docs.length - 1];
    }
    out.collections[c] = docs;
  }
  return out;
}
function keyFrom(pass, salt){ return crypto.scryptSync(String(pass), salt, 32); }
function checkPass(p){ if(!p || String(p).length < 12) throw new Error('BACKUP_PASSPHRASE لازم يكون 12 حرف على الأقل'); }
/* الملف = MAGIC(9) + salt(16) + iv(12) + tag(16) + المحتوى المشفّر (gzip(JSON)) */
function encrypt(obj, pass){
  checkPass(pass);
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', keyFrom(pass, salt), iv);
  const enc = Buffer.concat([c.update(zlib.gzipSync(Buffer.from(JSON.stringify(obj), 'utf8'))), c.final()]);
  return Buffer.concat([Buffer.from(MAGIC), salt, iv, c.getAuthTag(), enc]);
}
function decrypt(buf, pass){
  checkPass(pass);
  if(buf.slice(0, 9).toString() !== MAGIC) throw new Error('الملف ده مش نسخة O\'Roots مشفّرة');
  const salt = buf.slice(9, 25), iv = buf.slice(25, 37), tag = buf.slice(37, 53), d = crypto.createDecipheriv('aes-256-gcm', keyFrom(pass, salt), iv);
  d.setAuthTag(tag);
  try{ return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(buf.slice(53)), d.final()])).toString('utf8')); }
  catch(e){ throw new Error('فشل فك التشفير — كلمة السر غلط أو الملف تالف'); }
}
function countDocs(o){ return Object.keys(o.collections).reduce((a, c) => a + Object.keys(o.collections[c]).length, 0); }
/* استرجاع: بيكتب كل مستند بنفس الـ id (set). من غير apply بيرجّع بس العدّ */
async function restore(db, o, apply){
  const plan = Object.keys(o.collections).map(c => [c, Object.keys(o.collections[c]).length]);
  if(!apply) return {applied: false, plan};
  for(const c of Object.keys(o.collections)){
    const ids = Object.keys(o.collections[c]);
    for(let i = 0; i < ids.length; i += 400){
      const b = db.batch();
      ids.slice(i, i + 400).forEach(id => b.set(db.collection(c).doc(id), o.collections[c][id]));
      await b.commit();
    }
  }
  return {applied: true, plan};
}
async function main(){
  const [cmd, file] = process.argv.slice(2), arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').split('=').slice(1).join('=');
  const pass = process.env.BACKUP_PASSPHRASE;
  if(cmd === 'decrypt'){
    const o = decrypt(fs.readFileSync(file), pass), out = arg('out') || file.replace(/\.enc$/, '') + '.json';
    fs.writeFileSync(out, JSON.stringify(o)); console.log('اتفك التشفير:', out, '—', countDocs(o), 'مستند'); return;
  }
  const admin = require('firebase-admin');
  admin.initializeApp({credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))});
  const db = admin.firestore();
  if(cmd === 'backup'){
    checkPass(pass);
    const o = await exportAll(db), dir = arg('out') || 'backups'; fs.mkdirSync(dir, {recursive: true});
    const f = path.join(dir, `oroots-${o.exportedAt.slice(0, 10)}.json.gz.enc`);
    fs.writeFileSync(f, encrypt(o, pass)); console.log('اتعملت نسخة:', f, '—', countDocs(o), 'مستند'); return;
  }
  if(cmd === 'restore'){
    const o = decrypt(fs.readFileSync(file), pass), r = await restore(db, o, process.argv.includes('--apply'));
    console.log(r.applied ? 'اتسترجع:' : 'تجربة بس (مفيش كتابة) — هيتكتب:', JSON.stringify(r.plan)); return;
  }
  console.log('الأوامر: backup | decrypt <file> | restore <file> [--apply]'); process.exit(1);
}
module.exports = {COLLECTIONS, exportAll, encrypt, decrypt, restore, countDocs};
if(require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });
