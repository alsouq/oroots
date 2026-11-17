/* O'Roots — مخزن المستندات المحلي (بديل Firestore): كل مستند = مسار (collection/id) + بيانات JSON.
   الداتا كلها في الذاكرة (سريعة)، وكل كتابة بتتحفظ فورًا في SQLite (node:sqlite المدمج في Node 22.13+ / 24). */
'use strict';
const path = require('path'), fs = require('fs');

function now(){ return Date.now(); }
function isObj(v){ return v && typeof v === 'object' && !Array.isArray(v); }
function clone(v){ return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
/* قيم خاصة من التطبيق: {__fv:'increment', n} / {__fv:'delete'} / {__fv:'serverTimestamp'} / {__fv:'arrayUnion', v:[...]} / {__fv:'arrayRemove', v:[...]} */
function isFv(v){ return isObj(v) && typeof v.__fv === 'string'; }
function applyFv(cur, fv){
  switch(fv.__fv){
    case 'increment': return (typeof cur === 'number' ? cur : 0) + (Number(fv.n) || 0);
    case 'serverTimestamp': return now();
    case 'arrayUnion': { const a = Array.isArray(cur) ? cur.slice() : []; (fv.v || []).forEach(x => { if(!a.some(y => JSON.stringify(y) === JSON.stringify(x))) a.push(x); }); return a; }
    case 'arrayRemove': { const rm = (fv.v || []).map(x => JSON.stringify(x)); return (Array.isArray(cur) ? cur : []).filter(y => rm.indexOf(JSON.stringify(y)) < 0); }
    default: return undefined;
  }
}
/* بيحلّ القيم الخاصة جوه كائن (بالنسبة للقيمة القديمة) */
function resolve(val, old){
  if(isFv(val)) return val.__fv === 'delete' ? undefined : applyFv(old, val);
  if(Array.isArray(val)) return val.map(x => resolve(x, undefined));
  if(isObj(val)){
    const o = {};
    Object.keys(val).forEach(k => { const r = resolve(val[k], isObj(old) ? old[k] : undefined); if(r !== undefined) o[k] = r; });
    return o;
  }
  return val;
}
/* set مع merge: دمج عميق للكائنات (المصفوفات بتتبدّل) */
function deepMerge(base, patch){
  const out = isObj(base) ? Object.assign({}, base) : {};
  Object.keys(patch).forEach(k => {
    const v = patch[k];
    if(isFv(v)){ if(v.__fv === 'delete') delete out[k]; else out[k] = applyFv(out[k], v); }
    else if(isObj(v)) out[k] = deepMerge(out[k], v);
    else out[k] = resolve(v, out[k]);
  });
  return out;
}
/* update: المفاتيح ممكن تكون مسارات بنقط (a.b.c) */
function applyUpdate(base, patch){
  const out = clone(base) || {};
  Object.keys(patch).forEach(k => {
    const parts = k.split('.'); let o = out;
    for(let i = 0; i < parts.length - 1; i++){ if(!isObj(o[parts[i]])) o[parts[i]] = {}; o = o[parts[i]]; }
    const last = parts[parts.length - 1], v = patch[k];
    if(isFv(v)){ if(v.__fv === 'delete') delete o[last]; else o[last] = applyFv(o[last], v); }
    else o[last] = resolve(v, o[last]);
  });
  return out;
}
function getField(data, f){
  if(f === '__name__') return undefined;
  let v = data; for(const p of String(f).split('.')){ if(!isObj(v)) return undefined; v = v[p]; } return v;
}
function cmp(a, b){
  if(a === b) return 0;
  if(a === undefined || a === null) return -1;
  if(b === undefined || b === null) return 1;
  if(typeof a === typeof b) return a < b ? -1 : (a > b ? 1 : 0);
  const rank = v => typeof v === 'boolean' ? 0 : typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : 3;
  return rank(a) - rank(b);
}
function matchWhere(doc, w){
  const v = w.f === '__name__' ? doc.id : getField(doc.data, w.f), x = w.v;
  switch(w.op){
    case '==': return JSON.stringify(v) === JSON.stringify(x);
    case '!=': return v !== undefined && JSON.stringify(v) !== JSON.stringify(x);
    case '<': return v !== undefined && cmp(v, x) < 0;
    case '<=': return v !== undefined && cmp(v, x) <= 0;
    case '>': return v !== undefined && cmp(v, x) > 0;
    case '>=': return v !== undefined && cmp(v, x) >= 0;
    case 'in': return Array.isArray(x) && x.some(y => JSON.stringify(y) === JSON.stringify(v));
    case 'array-contains': return Array.isArray(v) && v.some(y => JSON.stringify(y) === JSON.stringify(x));
    default: return false;
  }
}

class Store {
  constructor(dir){
    this.dir = dir; fs.mkdirSync(dir, {recursive: true});
    const {DatabaseSync} = require('node:sqlite');
    this.db = new DatabaseSync(path.join(dir, 'oroots.db'));
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;" +
      "CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, coll TEXT NOT NULL, data TEXT NOT NULL, ver INTEGER NOT NULL, updated INTEGER NOT NULL);" +
      "CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);");
    this.docs = new Map();      // path → {id, coll, data, ver, updated}
    this.byColl = new Map();    // coll → Set(path)
    for(const r of this.db.prepare('SELECT path, coll, data, ver, updated FROM docs').all()){
      this._put(r.path, {id: r.path.split('/').pop(), coll: r.coll, data: JSON.parse(r.data), ver: r.ver, updated: r.updated});
    }
    this.qPut = this.db.prepare('INSERT INTO docs (path, coll, data, ver, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET data = excluded.data, ver = excluded.ver, updated = excluded.updated');
    this.qDel = this.db.prepare('DELETE FROM docs WHERE path = ?');
    this.listeners = [];
  }
  _put(p, d){ this.docs.set(p, d); if(!this.byColl.has(d.coll)) this.byColl.set(d.coll, new Set()); this.byColl.get(d.coll).add(p); }
  _del(p){ const d = this.docs.get(p); if(!d) return; this.docs.delete(p); const s = this.byColl.get(d.coll); if(s) s.delete(p); }
  static split(p){
    const parts = String(p || '').split('/').filter(Boolean);
    if(parts.length < 2 || parts.length % 2) throw Object.assign(new Error('bad path: ' + p), {status: 400});
    return {coll: parts.slice(0, -1).join('/'), id: parts[parts.length - 1], path: parts.join('/')};
  }
  get(p){ const d = this.docs.get(Store.split(p).path); return d ? {id: d.id, path: Store.split(p).path, data: clone(d.data), ver: d.ver} : null; }
  /* query: coll + where[{f, op, v}] + orderBy[{f, dir}] + limit */
  query(coll, where, orderBy, limit){
    const set = this.byColl.get(coll); if(!set) return [];
    let out = [];
    for(const p of set){ const d = this.docs.get(p); if((where || []).every(w => matchWhere(d, w))) out.push(d); }
    const ob = (orderBy && orderBy.length) ? orderBy : [];
    out.sort((a, b) => {
      for(const o of ob){ const c = o.f === '__name__' ? cmp(a.id, b.id) : cmp(getField(a.data, o.f), getField(b.data, o.f)); if(c) return o.dir === 'desc' ? -c : c; }
      return cmp(a.id, b.id);
    });
    if(limit > 0) out = out.slice(0, limit);
    return out.map(d => ({id: d.id, path: d.coll + '/' + d.id, data: clone(d.data), ver: d.ver}));
  }
  collections(){ return [...this.byColl.keys()].filter(c => this.byColl.get(c).size); }
  /* بيحسب نتيجة الكتابات من غير ما يحفظها (عشان القواعد تتشيك على البيانات الجديدة) */
  preview(writes){
    const staged = new Map();
    const cur = p => staged.has(p) ? staged.get(p) : (this.docs.has(p) ? clone(this.docs.get(p).data) : undefined);
    const out = [];
    for(const w of writes){
      const sp = Store.split(w.path), before = cur(sp.path);
      let after;
      if(w.op === 'delete') after = undefined;
      else if(w.op === 'update'){ if(before === undefined) throw Object.assign(new Error('not-found: ' + sp.path), {status: 404, code: 'not-found'}); after = applyUpdate(before, w.data || {}); }
      else if(w.op === 'set') after = w.merge ? deepMerge(before, w.data || {}) : resolve(w.data || {}, before);
      else throw Object.assign(new Error('bad op'), {status: 400});
      staged.set(sp.path, after);
      out.push({op: w.op, path: sp.path, coll: sp.coll, id: sp.id, before: before === undefined ? null : before, after: after === undefined ? null : after});
    }
    return out;
  }
  /* reads = [{path, ver}] شروط المعاملة (transaction): لو أي مستند اتغيّر من ساعة ما اتقرا ⇒ conflict */
  commit(writes, reads){
    for(const r of (reads || [])){
      const d = this.docs.get(Store.split(r.path).path), v = d ? d.ver : 0;
      if(v !== (r.ver || 0)) throw Object.assign(new Error('conflict'), {status: 409, code: 'aborted'});
    }
    const changes = this.preview(writes), t = now(), final = new Map();
    changes.forEach(c => final.set(c.path, c));
    this.db.exec('BEGIN');
    try{
      for(const c of final.values()){
        if(c.after === null){ this.qDel.run(c.path); }
        else { const d = this.docs.get(c.path); this.qPut.run(c.path, c.coll, JSON.stringify(c.after), (d ? d.ver : 0) + 1, t); }
      }
      this.db.exec('COMMIT');
    }catch(e){ this.db.exec('ROLLBACK'); throw e; }
    for(const c of final.values()){
      if(c.after === null) this._del(c.path);
      else { const d = this.docs.get(c.path); this._put(c.path, {id: c.id, coll: c.coll, data: c.after, ver: (d ? d.ver : 0) + 1, updated: t}); }
    }
    const list = [...final.values()];
    this.listeners.forEach(fn => { try{ fn(list); }catch(e){ console.error(e); } });
    return list;
  }
  onChange(fn){ this.listeners.push(fn); }
  kvGet(k){ const r = this.db.prepare('SELECT v FROM kv WHERE k = ?').get(k); return r ? JSON.parse(r.v) : null; }
  kvSet(k, v){ this.db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, JSON.stringify(v)); }
  exportAll(){
    const out = {app: 'oroots', version: 1, exportedAt: new Date().toISOString(), collections: {}};
    for(const d of this.docs.values()){ (out.collections[d.coll] = out.collections[d.coll] || {})[d.id] = d.data; }
    return out;
  }
  close(){ try{ this.db.close(); }catch(e){} }
}
module.exports = {Store, resolve, deepMerge, applyUpdate, matchWhere, getField};
