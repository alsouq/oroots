/* O'Roots — كلمة سر مؤقتة جديدة لحساب (مثلاً لو المدير نسي كلمة سره):
     node server/reset-password.js <الإيميل>
   الحساب بيخرج من كل الأجهزة، وأول ما يدخل بالكلمة المؤقتة بيطلب منه يغيّرها.
   (الموظفين العاديين: المدير بيعملهم كلمة سر جديدة من الإعدادات ← الموظفين، مش محتاج الأمر ده) */
'use strict';
process.removeAllListeners('warning');
const {Store} = require('./store');
const {Auth, randomPw} = require('./auth');
const {loadConfig} = require('./server');

const email = String(process.argv[2] || '').trim().toLowerCase();
if(!email){ console.log('الاستخدام: node server/reset-password.js <الإيميل>'); process.exit(1); }
const cfg = loadConfig(), store = new Store(cfg.dataDir), auth = new Auth(store);
if(!auth.exists(email) && email !== String(cfg.adminEmail || '').toLowerCase()){
  console.error('مفيش حساب بالإيميل ده: ' + email + '\nالحسابات الموجودة: ' + auth.list().map(u => u.email).join('، '));
  store.close(); process.exit(1);
}
const pw = randomPw(); auth.setPassword(email, pw, true); store.close();
console.log('كلمة السر المؤقتة لـ ' + email + ' :  ' + pw + '\n(أول ما يدخل بيها هيطلب تغييرها)');
