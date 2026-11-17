/* اختبار نقل الداتا من نسخة Firebase للسيرفر المحلي (server/import.js) */
process.removeAllListeners('warning');
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib');
const I = require('../server/import.js');
const B = require('../backup-firestore.js');
const {Store} = require('../server/store');
const {Auth} = require('../server/auth');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oroots-imp-'));
const backup = {app: 'oroots', version: 1, exportedAt: '2026-11-17T00:00:00Z', collections: {
  settings: {users: {list: [{username: 'Ali@Farm.com', role: 'employee', permissions: {water: 'edit'}}, {username: 'boss@farm.com', role: 'admin', permissions: {}}]}, systems: {list: [{id: 'S1', greenhouse: 'LG1', name: 'S1'}]}},
  roles: {'boss@farm.com': {role: 'admin'}},
  readings: {'irrigation_S1_2026-11-17': {source: 'irrigation', systemId: 'S1', date: '2026-11-17', entries: [{ts: '2026-11-17T09:00', ph: 6}]}},
  harvest: {h1: {ts: '2026-11-10T10:00', quantity: 5, createdAt: {_seconds: 1700000000, _nanoseconds: 500000000}}}
}};
// تجربة من غير كتابة
const plain = path.join(tmp, 'b.json'); fs.writeFileSync(plain, JSON.stringify(backup));
const dry = I.run(plain, false, {dataDir: path.join(tmp, 'data'), adminEmail: 'boss@farm.com'});
assert.strictEqual(dry.applied, false); assert.deepStrictEqual(dry.users, ['Ali@Farm.com', 'boss@farm.com']);
assert(!fs.existsSync(path.join(tmp, 'data', 'oroots.db')), 'التجربة ما بتكتبش');
// النسخة المشفّرة بتاعة GitHub Actions
process.env.BACKUP_PASSPHRASE = 'correct horse battery';
const enc = path.join(tmp, 'oroots-2026-11-17.json.gz.enc'); fs.writeFileSync(enc, B.encrypt(backup, process.env.BACKUP_PASSPHRASE));
const r = I.run(enc, true, {dataDir: path.join(tmp, 'data'), adminEmail: 'boss@farm.com'});
assert.strictEqual(r.applied, true); assert.strictEqual(r.created, 2);
const csv = fs.readFileSync(r.csv, 'utf8').trim().split('\n');
assert.strictEqual(csv[0], 'email,temp_password'); assert.strictEqual(csv.length, 3);
const store = new Store(path.join(tmp, 'data')), auth = new Auth(store);
assert.strictEqual(store.get('readings/irrigation_S1_2026-11-17').data.entries[0].ph, 6);
assert.strictEqual(store.get('harvest/h1').data.createdAt, 1700000000500, 'Timestamp بقى مللي ثانية');
assert.deepStrictEqual(store.get('roles/ali@farm.com').data, {role: 'employee', perms: {water: 'edit'}}, 'مستند صلاحيات للموظف من القايمة');
assert.deepStrictEqual(store.get('roles/boss@farm.com').data, {role: 'admin'}, 'المستند الموجود ما بيتغيّرش');
const ali = csv.filter(l => l.startsWith('ali@farm.com,'))[0].split(',')[1];
const s = auth.login('ali@farm.com', ali); assert(s.token && s.mustChange, 'الموظف بيدخل بالمؤقتة ولازم يغيّرها');
// الإيقاف بعد 5 محاولات غلط
for(let i = 0; i < 5; i++){ try{ auth.login('boss@farm.com', 'bad', '1.1.1.1'); }catch(e){ assert.strictEqual(e.code, 'auth/invalid-credential'); } }
assert.throws(() => auth.login('boss@farm.com', 'bad', '1.1.1.1'), e => e.code === 'auth/too-many-requests');
// gz عادي
const gz = path.join(tmp, 'b.json.gz'); fs.writeFileSync(gz, zlib.gzipSync(JSON.stringify(backup)));
assert.strictEqual(I.readBackup(gz).collections.harvest.h1.quantity, 5);
assert.throws(() => { delete process.env.BACKUP_PASSPHRASE; I.readBackup(enc); }, /BACKUP_PASSPHRASE/);
store.close();
// النقل ما يشتغلش والسيرفر شغّال (رقم عملية شغّالة في server.pid)
fs.writeFileSync(path.join(tmp, 'data', 'server.pid'), String(process.ppid));
assert.throws(() => I.run(plain, true, {dataDir: path.join(tmp, 'data'), adminEmail: 'boss@farm.com'}), /السيرفر شغّال/);
fs.writeFileSync(path.join(tmp, 'data', 'server.pid'), '999999');   // ملف قديم لعملية مش موجودة: عادي
assert.strictEqual(I.serverRunning(path.join(tmp, 'data')), false);
fs.unlinkSync(path.join(tmp, 'data', 'server.pid'));
// كلمة سر مؤقتة من سطر الأوامر (لو المدير نسي كلمة سره)
const cp = require('child_process');
const cfgFile = path.join(tmp, 'config.json'), env = Object.assign({}, process.env, {OROOTS_CONFIG: cfgFile});
fs.writeFileSync(cfgFile, JSON.stringify({dataDir: path.join(tmp, 'data'), adminEmail: 'boss@farm.com'}));
{
  const out = cp.execFileSync(process.execPath, [path.join(__dirname, '..', 'server', 'reset-password.js'), 'Boss@Farm.com'], {env}).toString();
  const npw = out.match(/:\s+([a-z0-9]{10})/)[1];
  const a2 = new Auth(new Store(path.join(tmp, 'data'))); const s2 = a2.login('boss@farm.com', npw, '2.2.2.2');
  assert(s2.token && s2.mustChange, 'الكلمة المؤقتة شغّالة ولازم تتغيّر');
  assert.throws(() => cp.execFileSync(process.execPath, [path.join(__dirname, '..', 'server', 'reset-password.js'), 'nobody@farm.com'], {stdio: 'pipe', env}));
}
// config.json فيه غلطة: رسالة واضحة بدل ما السيرفر يشتغل بالافتراضي من غير ما حد ياخد باله
fs.writeFileSync(cfgFile, '{"port": 8080,}');
assert.throws(() => cp.execFileSync(process.execPath, ['-e', 'require(' + JSON.stringify(path.join(__dirname, '..', 'server', 'server.js')) + ').loadConfig()'], {stdio: 'pipe', env}), e => /config\.json/.test(String(e.stderr)));
// نسخة السيرفر من الـ service worker: طلبات /api/ ما بتتخزّنش
const Bd = require('../server/build.js');
const sw = Bd.transformSw(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'));
assert(/var url = new URL\(req\.url\);\n\s+if\(url\.origin === self\.location\.origin && url\.pathname\.indexOf\('\/api\/'\) === 0\) return;/.test(sw));
console.log('local-import OK');
