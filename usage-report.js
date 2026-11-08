/* O'Roots — عدّاد استهلاك سكربتات GitHub (الإشعارات / التذكيرات / النسخ الاحتياطي).
   بيعدّ القراءات والكتابات اللي السكربت عملها على Firestore وبيسجّلها في usageStats (نفس مكان عدّاد الأجهزة)،
   فعدّاد الفريق في الإعدادات يشمل استهلاك السكربتات كمان وتعرف الحصة الحقيقية. أي فشل هنا مش بيوقف السكربت. */
'use strict';
const pacificDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Los_Angeles'}).format(d);

/* F = admin.firestore (أو أي كائن فيه Query / DocumentReference / Firestore). بيرجّع العدّاد {r, w}. */
function install(F, c = {r: 0, w: 0}){
  const wrap = (proto, name, fn) => {
    if(!proto || typeof proto[name] !== 'function' || proto[name].__usage) return;
    const orig = proto[name];
    proto[name] = function(...args){ const r = orig.apply(this, args); try{ fn(r, args); }catch(e){} return r; };
    proto[name].__usage = true;
  };
  try{
    if(F.Query) wrap(F.Query.prototype, 'get', p => p.then(s => { c.r += Math.max(1, (s && s.size) || 0); }, () => {}));
    if(F.DocumentReference){
      wrap(F.DocumentReference.prototype, 'get', p => p.then(() => { c.r += 1; }, () => {}));
      ['set', 'update', 'delete', 'create'].forEach(n => wrap(F.DocumentReference.prototype, n, () => { c.w += 1; }));
    }
    if(F.Firestore) wrap(F.Firestore.prototype, 'getAll', p => p.then(s => { c.r += (s && s.length) || 0; }, () => {}));
  }catch(e){ /* العدّاد اختياري */ }
  return c;
}

async function report(db, FieldValue, script, c){
  try{
    const day = pacificDay(), user = 'github-actions@' + script;
    await db.collection('usageStats').doc(`${day}__${user}__${script}`).set({
      day, user, device: script, r: FieldValue.increment(c.r), w: FieldValue.increment(c.w + 1), updatedAt: Date.now()
    }, {merge: true});
  }catch(e){ console.warn('تعذّر تسجيل استهلاك السكربت:', e && e.message); }
}

module.exports = {install, report, pacificDay};
