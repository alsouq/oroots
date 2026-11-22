/* O'Roots — سجل المواسير: لقطة يومية لحالة كل نظام (إجمالي المواسير / المنزرع / الفاضي / لكل صنف).
   - أي تعديل على مخطط المواسير (settings/pipeMaps) بيحدّث لقطة النهارده، فلقطة اليوم دايمًا آخر وضع.
   - وكل نص ساعة بيتأكد إن النهارده ليه لقطة (يوم جديد من غير تعديل بياخد نسخة من إمبارح).
   - التقرير في التطبيق (الحصاد ← سجل المواسير) بيقرا مجموعة pipeSnaps، واليوم اللي ملوش لقطة بياخد آخر لقطة قبله.
   اللقطات بتتسجّل من يوم تشغيل التحديث ده؛ الأيام اللي قبله مفيهاش بيانات (التطبيق ما كانش بيحفظ تاريخ المواسير). */
'use strict';
const path = require('path');
const CL = require(path.join(__dirname, '..', 'cost-logic.js'));

const dayOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const idOf = (sys, day) => String(sys).replace(/[\/\s]+/g, '-').slice(0, 120) + '_' + day;
const same = (a, b) => JSON.stringify([a.total, a.planted, a.empty, a.byCrop, a.rows, a.plants, a.rowsByCrop]) === JSON.stringify([b.total, b.planted, b.empty, b.byCrop, b.rows, b.plants, b.rowsByCrop]);

/* بيكتب لقطة النهارده لكل نظام في settings/pipeMaps (لو اتغيّرت عن المسجّلة). بيرجّع عدد اللقطات اللي اتكتبت */
function snapshotNow(app, now){
  const {store} = app, day = dayOf(new Date(now || Date.now()));
  const doc = store.get('settings/pipeMaps'), list = doc && Array.isArray(doc.data.list) ? doc.data.list : [];
  const writes = [];
  list.forEach(m => {
    if(!m || !m.systemId) return;
    const sn = CL.clPipeSnap(m), id = idOf(m.systemId, day), cur = store.get('pipeSnaps/' + id);
    if(cur && same(cur.data, sn)) return;
    writes.push({op: 'set', path: 'pipeSnaps/' + id, data: Object.assign({systemId: m.systemId, date: day, updatedAt: now || Date.now()}, sn)});
  });
  if(writes.length) store.commit(writes);
  return writes.length;
}

function start(app){
  const {hooks} = app;
  let busy = false;
  const run = () => { if(busy) return; busy = true; try{ snapshotNow(app); }catch(e){ console.error('سجل المواسير:', e.message); } finally{ busy = false; } };
  hooks.onCommit.push(changes => { if(changes.some(c => c.path === 'settings/pipeMaps')) run(); });
  run();
  setInterval(run, 30 * 60000).unref();
}
module.exports = {start, snapshotNow, dayOf};
