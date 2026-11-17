/* O'Roots — نسخة صغيرة من Firebase Admin فوق المخزن المحلي (من غير صلاحيات)،
   عشان سكربتات السيرفر (send-notifications / send-reminders) تشتغل زي ما هي على السيرفر المحلي. */
'use strict';
const W = require('./webpush');

function adminDb(store){
  const snapOf = (d, ref) => ({id: ref.id, ref, exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d.data)) : undefined});
  function docRef(p){
    const parts = String(p).split('/'), ref = {path: parts.join('/'), id: parts[parts.length - 1]};
    ref.get = async () => snapOf(store.get(ref.path), ref);
    ref.set = async (data, opts) => { store.commit([{op: 'set', path: ref.path, data, merge: !!(opts && opts.merge)}]); };
    ref.update = async data => { store.commit([{op: 'update', path: ref.path, data}]); };
    ref.delete = async () => { store.commit([{op: 'delete', path: ref.path}]); };
    return ref;
  }
  function query(coll, spec){
    spec = spec || {where: [], orderBy: [], limit: 0};
    const q = {
      where: (f, op, v) => query(coll, Object.assign({}, spec, {where: spec.where.concat([{f, op, v}])})),
      orderBy: (f, dir) => query(coll, Object.assign({}, spec, {orderBy: spec.orderBy.concat([{f, dir: dir === 'desc' ? 'desc' : 'asc'}])})),
      limit: n => query(coll, Object.assign({}, spec, {limit: n})),
      doc: id => docRef(coll + '/' + id),
      get: async () => {
        const docs = store.query(coll, spec.where, spec.orderBy, spec.limit).map(d => snapOf(d, docRef(coll + '/' + d.id)));
        return {docs, size: docs.length, empty: !docs.length, forEach: fn => docs.forEach(fn)};
      }
    };
    return q;
  }
  return {
    collection: c => query(c), doc: p => docRef(p),
    getAll: async (...refs) => Promise.all(refs.map(r => r.get())),
    batch(){ const w = []; return {set(r, d, o){ w.push({op: 'set', path: r.path, data: d, merge: !!(o && o.merge)}); return this; }, update(r, d){ w.push({op: 'update', path: r.path, data: d}); return this; }, delete(r){ w.push({op: 'delete', path: r.path}); return this; }, commit: async () => { if(w.length) store.commit(w); }}; }
  };
}
const FieldValue = {increment: n => ({__fv: 'increment', n}), delete: () => ({__fv: 'delete'}), serverTimestamp: () => ({__fv: 'serverTimestamp'})};

/* بديل admin.messaging(): التوكن = بصمة اشتراك Web Push اللي المتصفح سجّله في السيرفر */
function messaging(store, vapid, subject){
  return {
    async sendEachForMulticast({tokens, data, webpush}){
      const responses = [];
      for(const t of tokens || []){
        const rec = store.kvGet('push:' + t);
        if(!rec || !rec.sub){ responses.push({success: false, error: {code: 'messaging/registration-token-not-registered'}}); continue; }
        const ttl = webpush && webpush.headers && Number(webpush.headers.TTL);
        const r = await W.send(rec.sub, {data}, vapid, {ttl: ttl || 86400, subject});
        if(r.status >= 200 && r.status < 300) responses.push({success: true});
        else if(r.status === 404 || r.status === 410){ store.db.prepare('DELETE FROM kv WHERE k = ?').run('push:' + t); responses.push({success: false, error: {code: 'messaging/registration-token-not-registered'}}); }
        else responses.push({success: false, error: {code: 'messaging/unavailable', message: r.error || String(r.status)}});
      }
      return {successCount: responses.filter(x => x.success).length, failureCount: responses.filter(x => !x.success).length, responses};
    }
  };
}
module.exports = {adminDb, FieldValue, messaging};
