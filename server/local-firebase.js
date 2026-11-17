/* O'Roots — بديل Firebase في المتصفح للسيرفر المحلي.
   بيعرّف window.firebase بنفس الأجزاء اللي التطبيق بيستخدمها من مكتبة Firebase (compat): auth / firestore / messaging،
   بس كل حاجة بتروح لسيرفر المزرعة (/api) بدل جوجل. التحديث اللحظي بـ Server-Sent Events. */
(function(){
  'use strict';
  var API = '/api', TOKEN_KEY = 'oroots_local_token';
  window.OROOTS_LOCAL = true;
  function token(){ try{ return localStorage.getItem(TOKEN_KEY) || ''; }catch(e){ return ''; } }
  function setToken(t){ try{ if(t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }catch(e){} }
  function err(code, msg){ var e = new Error(msg || code); e.code = code; return e; }
  var net = {ok: true};
  function netState(ok){ if(net.ok !== ok){ net.ok = ok; syncEvent(); } }
  function call(method, url, body){
    var h = {'Content-Type': 'application/json'}, t = token(); if(t) h.Authorization = 'Bearer ' + t;
    // شبكة ضعيفة أو واي فاي من غير نت: من غير مهلة الطلب ممكن يفضل معلّق دقايق — بعد 20 ثانية بنعتبره «مفيش نت»
    var ctl = window.AbortController ? new AbortController() : null, tm = ctl ? setTimeout(function(){ ctl.abort(); }, 20000) : null;
    return fetch(API + url, {method: method, headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: ctl ? ctl.signal : undefined}).then(function(r){
      clearTimeout(tm); netState(true);
      return r.json().catch(function(){ return {}; }).then(function(j){
        if(r.ok) return j;
        var code = j.error || 'internal';
        if(code === 'permission-denied' || code === 'unauthenticated' || code === 'not-found' || code === 'aborted') throw err(code, j.message);
        throw err(code, j.message || code);
      });
    }, function(){ clearTimeout(tm); netState(false); throw err(url.indexOf('/auth/') === 0 ? 'auth/network-request-failed' : 'unavailable', 'network'); });
  }
  function genId(){ var a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', s = '', b = new Uint8Array(20); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach(function(x, i){ b[i] = Math.random()*256; }); for(var i = 0; i < 20; i++) s += a[b[i] % a.length]; return s; }

  /* ---------- Auth ---------- */
  var authState = {user: null, ready: false, cbs: []};
  function setUser(email){
    authState.user = email ? {email: email, uid: email, emailVerified: true} : null; authState.ready = true;
    authState.cbs.slice().forEach(function(cb){ try{ cb(authState.user); }catch(e){ console.error(e); } });
    if(email) rt.start(); else rt.stop();
  }
  /* كلمة السر المؤقتة (حساب جديد أو المدير غيّرها): لازم الموظف يختار كلمة سر جديدة */
  function askNewPassword(){
    if(document.getElementById('lf-pw')) return;
    var box = document.createElement('div'); box.id = 'lf-pw';
    box.setAttribute('style', 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;');
    box.innerHTML = '<form data-noconfirm="1" style="background:#fff;color:#1d2a22;border-radius:16px;padding:20px;max-width:360px;width:100%;font-family:inherit;box-shadow:0 10px 40px rgba(0,0,0,.3);">' +
      '<h3 style="margin:0 0 8px;">🔑 اختار كلمة سر جديدة</h3><p style="margin:0 0 12px;font-size:.9rem;color:#5b6b60;">إنت داخل بكلمة سر مؤقتة. اختار كلمة سر خاصة بيك (6 حروف على الأقل).</p>' +
      '<input type="password" id="lf-pw1" autocomplete="new-password" placeholder="كلمة السر الجديدة" style="width:100%;box-sizing:border-box;padding:10px;margin:0 0 8px;border:1px solid #ccd;border-radius:10px;font-size:1rem;">' +
      '<input type="password" id="lf-pw2" autocomplete="new-password" placeholder="أكّد كلمة السر" style="width:100%;box-sizing:border-box;padding:10px;margin:0 0 8px;border:1px solid #ccd;border-radius:10px;font-size:1rem;">' +
      '<p id="lf-pwe" style="color:#c0392b;min-height:1.2em;margin:0 0 8px;font-size:.85rem;"></p>' +
      '<button type="submit" style="width:100%;padding:11px;border:0;border-radius:10px;background:#1f8a5b;color:#fff;font-weight:700;font-size:1rem;">حفظ</button></form>';
    document.body.appendChild(box);
    box.querySelector('form').addEventListener('submit', function(ev){
      ev.preventDefault();
      var a = box.querySelector('#lf-pw1').value, b = box.querySelector('#lf-pw2').value, e = box.querySelector('#lf-pwe');
      if(a.length < 6){ e.textContent = 'كلمة السر لازم 6 حروف على الأقل'; return; }
      if(a !== b){ e.textContent = 'كلمتين السر مش زي بعض'; return; }
      call('POST', '/auth/password', {newPassword: a}).then(function(j){ setToken(j.token); box.remove(); rt.stop(); rt.start(); }, function(){ e.textContent = 'ما اتحفظتش — جرّب تاني'; });
    });
  }
  function bootAuth(){
    if(!token()){ setTimeout(function(){ setUser(null); }, 0); return; }
    call('GET', '/auth/me').then(function(j){ setUser(j.email); if(j.mustChange) askNewPassword(); }, function(e){
      if(e.code === 'unauthenticated') setToken('');
      // مفيش نت: بيفضل داخل بآخر حساب (والبيانات من الجهاز) لحد ما السيرفر يرجع
      var off = e.code === 'unavailable' || e.code === 'auth/network-request-failed';
      setUser(off ? (localStorage.getItem('oroots_local_email') || null) : null);
    });
  }
  function makeAuth(secondary){
    return {
      get currentUser(){ return secondary ? null : authState.user; },
      onAuthStateChanged: function(cb){ authState.cbs.push(cb); if(authState.ready) setTimeout(function(){ cb(authState.user); }, 0); return function(){ authState.cbs = authState.cbs.filter(function(x){ return x !== cb; }); }; },
      signInWithEmailAndPassword: function(email, pw){
        return call('POST', '/auth/login', {email: email, password: pw}).then(function(j){
          setToken(j.token); try{ localStorage.setItem('oroots_local_email', j.email); }catch(e){} setUser(j.email);
          if(j.mustChange) setTimeout(askNewPassword, 300);
          return {user: authState.user};
        });
      },
      /* الحساب الثانوي (إضافة موظف من الإعدادات): بيتعمل على السيرفر بصلاحية المدير، ومن غير ما يخرج المدير */
      createUserWithEmailAndPassword: function(email, pw){ return call('POST', '/auth/create', {email: email, password: pw}).then(function(){ return {user: {email: email}}; }); },
      signOut: function(){
        if(secondary) return Promise.resolve();
        var n = OFF.pending();
        if(n && !window.confirm('فيه ' + n + ' حاجة اتسجّلت من غير نت ولسه ما اتبعتتش للسيرفر. لو خرجت دلوقتي هتضيع. تخرج برضه؟')) return Promise.reject(err('cancelled', 'cancelled'));
        var p = call('POST', '/auth/logout').catch(function(){}); OFF.clearUser(); setToken(''); setUser(null); return p;
      },
      /* مفيش إيميل على السيرفر المحلي: المدير بياخد كلمة سر مؤقتة يديها للموظف */
      sendPasswordResetEmail: function(email){
        return call('POST', '/auth/reset', {email: email}).then(function(j){
          window.alert('كلمة السر المؤقتة الجديدة:\n' + email + '\n\n' + j.tempPassword + '\n\nابعتها للموظف — أول ما يدخل بيها هيختار كلمة سر خاصة بيه.');
        });
      }
    };
  }

  /* ---------- Firestore ---------- */
  function FV(kind, extra){ var o = {__fv: kind}; for(var k in extra) o[k] = extra[k]; return o; }
  var FieldValue = {
    increment: function(n){ return FV('increment', {n: n}); }, delete: function(){ return FV('delete'); },
    serverTimestamp: function(){ return FV('serverTimestamp'); },
    arrayUnion: function(){ return FV('arrayUnion', {v: Array.prototype.slice.call(arguments)}); },
    arrayRemove: function(){ return FV('arrayRemove', {v: Array.prototype.slice.call(arguments)}); }
  };
  function plain(v){ return v === undefined ? null : JSON.parse(JSON.stringify(v, function(k, x){ return x === undefined ? null : x; })); }
  function docSnap(ref, j, fromCache){
    var data = j && j.exists !== false && j.data ? j.data : null;
    return {id: ref.id, ref: ref, exists: !!data, metadata: {fromCache: !!fromCache, hasPendingWrites: !!(j && j.pending)},
      data: function(){ return data ? JSON.parse(JSON.stringify(data)) : undefined; },
      get: function(f){ var v = data; String(f).split('.').forEach(function(p){ v = v == null ? undefined : v[p]; }); return v; }};
  }
  function querySnap(coll, raw, fromCache){
    var list = (raw.docs || []).map(function(d){ return docSnap(new DocRef(coll + '/' + d.id), {exists: true, data: d.data}, fromCache); });
    return {docs: list, size: list.length, empty: !list.length, metadata: {fromCache: !!fromCache, hasPendingWrites: !!raw.pending}, forEach: function(fn){ list.forEach(fn); }};
  }
  function DocRef(p){ var parts = String(p).split('/'); this.path = parts.join('/'); this.id = parts[parts.length - 1]; this._coll = parts.slice(0, -1).join('/'); this.parent = {id: parts[parts.length - 2], path: this._coll}; }
  DocRef.prototype.get = function(){
    var self = this, k = 'd:' + this.path;
    return OFF.ready.then(function(){ return call('POST', '/db/get', {path: self.path}); }).then(function(j){ OFF.cachePut(k, j); return docSnap(self, OFF.overlayDoc(self.path, j)); }, function(e){
      if(e.code !== 'unavailable') throw e;
      var c = OFF.cacheGet(k), o = OFF.overlayDoc(self.path, c);
      if(c || (o && o.pending)) return docSnap(self, o, true);
      throw e;
    });
  };
  DocRef.prototype.set = function(data, opts){ return commit([{op: 'set', path: this.path, data: plain(data), merge: !!(opts && opts.merge)}]); };
  DocRef.prototype.update = function(data){ return commit([{op: 'update', path: this.path, data: plain(data)}]); };
  DocRef.prototype.delete = function(){ return commit([{op: 'delete', path: this.path}]); };
  DocRef.prototype.collection = function(c){ return new Query(this.path + '/' + c); };
  DocRef.prototype.onSnapshot = function(a, b, c){
    var cb = typeof a === 'function' ? a : b, eb = typeof a === 'function' ? b : c, self = this;
    return rt.listen({kind: 'doc', path: this.path, coll: this._coll, run: function(){ return self.get(); }, cb: cb, eb: eb});
  };
  function Query(coll, spec){ this.coll = coll; this.id = coll.split('/').pop(); this.path = coll; this.spec = spec || {where: [], orderBy: [], limit: 0}; }
  Query.prototype._with = function(k, v){ var s = {where: this.spec.where.slice(), orderBy: this.spec.orderBy.slice(), limit: this.spec.limit}; if(k === 'limit') s.limit = v; else s[k].push(v); return new Query(this.coll, s); };
  Query.prototype.where = function(f, op, v){ return this._with('where', {f: String(f), op: op, v: plain(v)}); };
  Query.prototype.orderBy = function(f, dir){ return this._with('orderBy', {f: String(f), dir: dir === 'desc' ? 'desc' : 'asc'}); };
  Query.prototype.limit = function(n){ return this._with('limit', n); };
  Query.prototype.doc = function(id){ return new DocRef(this.coll + '/' + (id == null ? genId() : id)); };
  Query.prototype.add = function(data){ var r = this.doc(); return r.set(data).then(function(){ return r; }); };
  Query.prototype.get = function(){
    var self = this, k = 'q:' + this.coll + ':' + JSON.stringify(this.spec);
    return OFF.ready.then(function(){ return call('POST', '/db/query', {coll: self.coll, where: self.spec.where, orderBy: self.spec.orderBy, limit: self.spec.limit}); }).then(function(j){
      OFF.cachePut(k, {docs: j.docs || []}); return querySnap(self.coll, OFF.overlayQuery(self.coll, self.spec, {docs: j.docs || []}));
    }, function(e){
      if(e.code !== 'unavailable') throw e;
      var c = OFF.cacheGet(k), o = OFF.overlayQuery(self.coll, self.spec, c || {docs: []});
      if(c || o.pending) return querySnap(self.coll, o, true);
      throw e;
    });
  };
  Query.prototype.onSnapshot = function(a, b, c){
    var cb = typeof a === 'function' ? a : b, eb = typeof a === 'function' ? b : c, self = this;
    return rt.listen({kind: 'query', coll: this.coll, run: function(){ return self.get(); }, cb: cb, eb: eb});
  };
  function sendCommit(writes, reads){ return call('POST', '/db/commit', {writes: writes, reads: reads || []}).then(function(){ rt.nudge(writes); }); }
  function commit(writes, reads){
    if(reads && reads.length) return sendCommit(writes, reads);   // معاملة: لازم السيرفر
    return OFF.ready.then(function(){
      if(OFF.pending(true) || navigator.onLine === false) return OFF.enqueue({t: 'w', writes: writes});
      return sendCommit(writes).catch(function(e){ if(e.code === 'unavailable') return OFF.enqueue({t: 'w', writes: writes}); throw e; });
    });
  }
  function Batch(){ this.w = []; }
  Batch.prototype.set = function(ref, data, opts){ this.w.push({op: 'set', path: ref.path, data: plain(data), merge: !!(opts && opts.merge)}); return this; };
  Batch.prototype.update = function(ref, data){ this.w.push({op: 'update', path: ref.path, data: plain(data)}); return this; };
  Batch.prototype.delete = function(ref){ this.w.push({op: 'delete', path: ref.path}); return this; };
  Batch.prototype.commit = function(){ return this.w.length ? commit(this.w) : Promise.resolve(); };
  /* معاملة: بنقرا بنسخة (ver)، ولو حد غيّر المستند قبل ما نكتب السيرفر بيرفض ونعيد (لحد 5 مرات) */
  function runTransaction(fn, attempt){
    attempt = attempt || 0;
    var reads = [], b = new Batch();
    var tx = {
      get: function(ref){ return call('POST', '/db/get', {path: ref.path}).then(function(j){ reads.push({path: ref.path, ver: j.ver || 0}); return docSnap(ref, j); }); },
      set: function(ref, d, o){ b.set(ref, d, o); return tx; }, update: function(ref, d){ b.update(ref, d); return tx; }, delete: function(ref){ b.delete(ref); return tx; }
    };
    return Promise.resolve(fn(tx)).then(function(result){
      if(!b.w.length) return result;
      return commit(b.w, reads).then(function(){ return result; }, function(e){ if(e.code === 'aborted' && attempt < 5) return runTransaction(fn, attempt + 1); throw e; });
    });
  }

  /* ---------- من غير نت: طابور حفظ على الجهاز + آخر بيانات اتشافت ----------
     - أي حفظ والنت مقطوع بيتحفظ في الجهاز (IndexedDB) وبيتبعت بالترتيب أول ما النت يرجع.
     - إضافة قراءة/عنصر لقايمة (txMerge) بتتحفظ كـ«دمج» مش استبدال: لما تتبعت بتتدمج مع اللي اتضاف من أجهزة تانية.
     - القراءة من غير نت: آخر نسخة شافها الجهاز + التغييرات اللي لسه ما اتبعتتش.
     - لو حاجة اترفضت لما اتبعتت (صلاحية/بيانات اتغيّرت) بيظهر تنبيه واضح. */
  var OFF = (function(){
    var DBN = 'oroots-offline', idb = null, cache = {}, queue = [], flushing = false, timer = null, failed = 0;
    function me(){ try{ return (localStorage.getItem('oroots_local_email') || '').toLowerCase(); }catch(e){ return ''; } }
    function clone(v){ return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
    function isObj(v){ return v && typeof v === 'object' && !Array.isArray(v); }
    function isFv(v){ return isObj(v) && typeof v.__fv === 'string'; }
    function store(name, mode, fn){
      if(!idb) return Promise.resolve();
      return new Promise(function(res){ try{ var t = idb.transaction(name, mode), r = fn(t.objectStore(name)); t.oncomplete = function(){ res(r && r.result); }; t.onerror = t.onabort = function(){ res(); }; }catch(e){ res(); } });
    }
    var ready = new Promise(function(res){
      var done = false, fin = function(){ if(!done){ done = true; res(); } };
      setTimeout(fin, 1500);
      if(!window.indexedDB){ fin(); return; }
      var r; try{ r = indexedDB.open(DBN, 1); }catch(e){ fin(); return; }
      r.onupgradeneeded = function(){ var d = r.result; if(!d.objectStoreNames.contains('cache')) d.createObjectStore('cache'); if(!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', {keyPath: 'id'}); };
      r.onerror = r.onblocked = fin;
      r.onsuccess = function(){
        idb = r.result;
        Promise.all([
          store('queue', 'readonly', function(s){ return s.getAll(); }),
          new Promise(function(ok){ try{ var t = idb.transaction('cache', 'readonly'), s = t.objectStore('cache'), keys = s.getAllKeys(), vals = s.getAll(); t.oncomplete = function(){ (keys.result || []).forEach(function(k, i){ cache[k] = vals.result[i]; }); ok(); }; t.onerror = function(){ ok(); }; }catch(e){ ok(); } })
        ]).then(function(a){ queue = (a[0] || []).sort(function(x, y){ return x.id - y.id; }); fin(); syncEvent(); if(queue.length) setTimeout(flush, 500); });
      };
    });
    /* الكاش لكل مستخدم لوحده (جهاز مشترك) */
    function ck(k){ return me() + '|' + k; }
    function cachePut(k, v){ cache[ck(k)] = v; store('cache', 'readwrite', function(s){ return s.put(v, ck(k)); }); }
    function cacheGet(k){ return cache[ck(k)]; }
    function mine(){ var m = me(); return queue.filter(function(it){ return it.user === m; }); }
    /* العدد اللي بيظهر للمستخدم: من غير سجل المراجعة وعداد الاستخدام (بيتسجّلوا جنب كل حفظ). all = الكل (لترتيب الإرسال) */
    function bg(it){ return it.t === 'w' && it.writes.every(function(w){ return /^(auditLog|usageStats)\//.test(w.path); }); }
    function pending(all){ var l = mine(); return all ? l.length : l.filter(function(it){ return !bg(it); }).length; }
    function enqueue(it){
      it.id = Date.now() * 1000 + Math.floor(Math.random() * 1000); it.user = me(); it.at = Date.now();
      queue.push(it); store('queue', 'readwrite', function(s){ return s.put(it); });
      rt.nudge(paths(it)); syncEvent(); schedule(1500);
      return Promise.resolve();
    }
    function remove(it){ queue = queue.filter(function(x){ return x !== it; }); store('queue', 'readwrite', function(s){ return s.delete(it.id); }); }
    function paths(it){ return it.t === 'm' ? [{path: it.m.path}] : it.writes; }
    function schedule(ms){ clearTimeout(timer); timer = setTimeout(flush, ms); }
    /* الدمج: نفس منطق txMerge في التطبيق — بيتحسب على النسخة اللي على السيرفر وقت الإرسال */
    function applyMerge(data, m){
      data = isObj(data) ? clone(data) : {};
      var keyOf = function(x){ return x && x[m.key] != null ? String(x[m.key]) : JSON.stringify(x); };
      var cur = Array.isArray(data[m.field]) ? data[m.field].slice() : [], rm = {};
      (m.remove || []).forEach(function(k){ rm[k] = 1; });
      cur = cur.filter(function(x){ return !rm[keyOf(x)]; });
      var idx = {}; cur.forEach(function(x, i){ idx[keyOf(x)] = i; });
      (m.change || []).concat(m.add || []).forEach(function(x){ var k = keyOf(x); if(k in idx) cur[idx[k]] = x; else { idx[k] = cur.length; cur.push(x); } });
      if(m.sort) cur.sort(function(a, b){ return String((a || {})[m.sort] || '').localeCompare(String((b || {})[m.sort] || '')); });
      Object.keys(m.extra || {}).forEach(function(k){ data[k] = m.extra[k]; });
      data[m.field] = cur;
      return data;
    }
    function mergeNow(m){
      return runTransaction(function(tx){ var ref = new DocRef(m.path); return tx.get(ref).then(function(s){ tx.set(ref, applyMerge(s.exists ? s.data() : {}, m)); }); });
    }
    /* نفس قواعد السيرفر (store.js) عشان العرض من غير نت يبقى زي اللي هيتحفظ */
    function applyFv(cur, fv){
      if(fv.__fv === 'increment') return (typeof cur === 'number' ? cur : 0) + (Number(fv.n) || 0);
      if(fv.__fv === 'serverTimestamp') return Date.now();
      if(fv.__fv === 'arrayUnion'){ var a = Array.isArray(cur) ? cur.slice() : []; (fv.v || []).forEach(function(x){ if(!a.some(function(y){ return JSON.stringify(y) === JSON.stringify(x); })) a.push(x); }); return a; }
      if(fv.__fv === 'arrayRemove'){ var rm = (fv.v || []).map(function(x){ return JSON.stringify(x); }); return (Array.isArray(cur) ? cur : []).filter(function(y){ return rm.indexOf(JSON.stringify(y)) < 0; }); }
      return undefined;
    }
    function resolve(val, old){
      if(isFv(val)) return val.__fv === 'delete' ? undefined : applyFv(old, val);
      if(Array.isArray(val)) return val.map(function(x){ return resolve(x, undefined); });
      if(isObj(val)){ var o = {}; Object.keys(val).forEach(function(k){ var r = resolve(val[k], isObj(old) ? old[k] : undefined); if(r !== undefined) o[k] = r; }); return o; }
      return val;
    }
    function deepMerge(base, patch){
      var out = isObj(base) ? Object.assign({}, base) : {};
      Object.keys(patch).forEach(function(k){ var v = patch[k];
        if(isFv(v)){ if(v.__fv === 'delete') delete out[k]; else out[k] = applyFv(out[k], v); }
        else if(isObj(v)) out[k] = deepMerge(out[k], v); else out[k] = resolve(v, out[k]); });
      return out;
    }
    function applyWrite(cur, w){
      if(w.op === 'delete') return undefined;
      if(w.op === 'set') return w.merge ? deepMerge(cur, w.data || {}) : resolve(w.data || {}, cur);
      if(w.op === 'update'){
        if(cur === undefined) return undefined;
        var out = clone(cur) || {};
        Object.keys(w.data || {}).forEach(function(k){
          var parts = k.split('.'), o = out;
          for(var i = 0; i < parts.length - 1; i++){ if(!isObj(o[parts[i]])) o[parts[i]] = {}; o = o[parts[i]]; }
          var last = parts[parts.length - 1], v = w.data[k];
          if(isFv(v)){ if(v.__fv === 'delete') delete o[last]; else o[last] = applyFv(o[last], v); } else o[last] = resolve(v, o[last]);
        });
        return out;
      }
      return cur;
    }
    function getField(d, f){ var v = d; String(f).split('.').forEach(function(p){ v = isObj(v) ? v[p] : undefined; }); return v; }
    function cmp(a, b){ if(a === b) return 0; if(a == null) return -1; if(b == null) return 1; return a < b ? -1 : (a > b ? 1 : 0); }
    function match(d, w){
      var v = getField(d, w.f), x = w.v;
      switch(w.op){
        case '==': return JSON.stringify(v) === JSON.stringify(x);
        case '!=': return v !== undefined && JSON.stringify(v) !== JSON.stringify(x);
        case '<': return v !== undefined && cmp(v, x) < 0; case '<=': return v !== undefined && cmp(v, x) <= 0;
        case '>': return v !== undefined && cmp(v, x) > 0; case '>=': return v !== undefined && cmp(v, x) >= 0;
        case 'in': return Array.isArray(x) && x.some(function(y){ return JSON.stringify(y) === JSON.stringify(v); });
        case 'array-contains': return Array.isArray(v) && v.some(function(y){ return JSON.stringify(y) === JSON.stringify(x); });
      }
      return true;
    }
    function overlayDoc(path, raw){
      var data = raw && raw.exists !== false && raw.data ? clone(raw.data) : undefined, touched = false;
      mine().forEach(function(it){
        if(it.t === 'm'){ if(it.m.path === path){ data = applyMerge(data, it.m); touched = true; } return; }
        it.writes.forEach(function(w){ if(w.path === path){ data = applyWrite(data, w); touched = true; } });
      });
      return touched ? {exists: data !== undefined, data: data, pending: true} : raw;
    }
    function overlayQuery(coll, spec, raw){
      var docs = (raw.docs || []).map(function(d){ return {id: d.id, data: clone(d.data)}; }), touched = false, byId = {};
      docs.forEach(function(d, i){ byId[d.id] = i; });
      mine().forEach(function(it){
        var ops = it.t === 'm' ? [{path: it.m.path, m: it.m}] : it.writes;
        ops.forEach(function(w){
          var p = String(w.path).split('/'), id = p.pop(); if(p.join('/') !== coll) return;
          var i = byId[id], cur = (i != null && docs[i]) ? docs[i].data : undefined, next = w.m ? applyMerge(cur, w.m) : applyWrite(cur, w);
          touched = true;
          var ok = next !== undefined && (spec.where || []).every(function(c){ return match(next, c); });
          if(!ok){ if(i != null) docs[i] = null; return; }
          if(i != null) docs[i] = {id: id, data: next}; else { byId[id] = docs.length; docs.push({id: id, data: next}); }
        });
      });
      if(!touched) return raw;
      docs = docs.filter(Boolean);
      var ob = spec.orderBy || [];
      if(ob.length) docs.sort(function(a, b){ for(var j = 0; j < ob.length; j++){ var c = cmp(getField(a.data, ob[j].f), getField(b.data, ob[j].f)); if(c) return ob[j].dir === 'desc' ? -c : c; } return 0; });
      if(spec.limit > 0) docs = docs.slice(0, spec.limit);
      return {docs: docs, pending: true};
    }
    function flush(){
      if(flushing || !token()) return;
      var list = mine(); if(!list.length){ syncEvent(); return; }
      if(navigator.onLine === false){ schedule(15000); return; }
      flushing = true; syncEvent();
      var it = list[0];
      (it.t === 'm' ? mergeNow(it.m) : sendCommit(it.writes)).then(function(){
        remove(it); flushing = false; rt.nudge(paths(it));
        if(!mine().length){ syncEvent(); if(!failed) notify('ok'); } else flush();
      }, function(e){
        flushing = false;
        if(e.code === 'unavailable'){ syncEvent(); schedule(15000); return; }
        if(e.code === 'unauthenticated'){ syncEvent(); return; }   // هيتبعت بعد ما يسجّل دخول تاني
        console.error('offline write rejected', e, it);
        remove(it); failed++; rt.nudge(paths(it)); notify('fail', e.code); flush();
      });
    }
    /* شريط صغير: اتبعت كل حاجة / فيه حاجة اترفضت */
    function notify(kind, code){
      var old = document.getElementById('lf-sync-note'); if(old) old.remove();
      var n = document.createElement('div'); n.id = 'lf-sync-note';
      n.setAttribute('style', 'position:fixed;left:12px;right:12px;bottom:14px;z-index:99990;max-width:520px;margin:0 auto;padding:12px 14px;border-radius:12px;font:inherit;font-size:.9rem;box-shadow:0 8px 30px rgba(0,0,0,.25);color:#fff;background:' + (kind === 'ok' ? '#1f8a5b' : '#c0392b') + ';');
      n.textContent = kind === 'ok' ? '✅ اتبعت للسيرفر كل اللي اتسجّل من غير نت.' :
        '⛔ فيه ' + failed + ' حاجة اتسجّلت من غير نت وما اتحفظتش على السيرفر' + (code === 'permission-denied' ? ' لأن مفيش صلاحية' : code === 'not-found' ? ' لأنها اتمسحت من جهاز تاني' : '') + ' — راجعها وسجّلها تاني';
      n.addEventListener('click', function(){ n.remove(); if(kind !== 'ok') failed = 0; });   // التنبيه الأحمر بيفضل لحد ما يتقفل
      document.body.appendChild(n);
      if(kind === 'ok') setTimeout(function(){ n.remove(); }, 5000);
      syncEvent();
    }
    function clearUser(){ var p = me() + '|'; Object.keys(cache).forEach(function(k){ if(k.indexOf(p) === 0) delete cache[k]; }); store('cache', 'readwrite', function(s){ return s.clear(); }); }
    window.addEventListener('online', function(){ netState(true); schedule(500); });
    window.addEventListener('offline', function(){ netState(false); });
    setInterval(function(){ if(mine().length) flush(); }, 20000);
    return {ready: ready, cachePut: cachePut, cacheGet: cacheGet, enqueue: enqueue, pending: pending, overlayDoc: overlayDoc, overlayQuery: overlayQuery, flush: flush, clearUser: clearUser,
      isFlushing: function(){ return flushing; }};
  })();
  /* التطبيق بيسمع ده عشان يحدّث شارة الاتصال */
  function syncEvent(){ try{ window.dispatchEvent(new Event('oroots-sync')); }catch(e){} }

  var db = {
    collection: function(c){ return new Query(c); }, doc: function(p){ return new DocRef(p); },
    batch: function(){ return new Batch(); }, runTransaction: function(fn){ return runTransaction(fn); },
    enablePersistence: function(){ return Promise.resolve(); }, settings: function(){}, getAll: function(){ var refs = Array.prototype.slice.call(arguments); return Promise.all(refs.map(function(r){ return r.get(); })); }
  };

  /* ---------- تحديث لحظي (SSE) ---------- */
  var rt = {
    es: null, ls: [], timers: {},
    start: function(){
      if(rt.es || !token() || !window.EventSource) return;
      var es = rt.es = new EventSource(API + '/events?token=' + encodeURIComponent(token())), first = true;
      es.onmessage = function(ev){ var list = []; try{ list = JSON.parse(ev.data); }catch(e){} rt.changed(list); };
      es.onopen = function(){ netState(true); OFF.flush(); if(!first) rt.refreshAll(); first = false; };   // بعد ما النت يرجع: نبعت اللي اتسجّل ونجيب كل حاجة من جديد
      es.onerror = function(){ if(navigator.onLine === false) netState(false); if(es.readyState === 2){ rt.es = null; setTimeout(rt.start, 5000); } };
    },
    stop: function(){ if(rt.es){ rt.es.close(); rt.es = null; } },
    listen: function(l){
      rt.ls.push(l); rt.run(l);
      return function(){ l.dead = true; rt.ls = rt.ls.filter(function(x){ return x !== l; }); };
    },
    run: function(l){
      if(l.dead || l.busy){ if(l.busy) l.again = true; return; }
      l.busy = true;
      l.run().then(function(s){ l.busy = false; if(!l.dead){ try{ l.cb(s); }catch(e){ console.error(e); } } if(l.again){ l.again = false; rt.run(l); } },
        function(e){ l.busy = false; if(e.code === 'unavailable'){ setTimeout(function(){ rt.run(l); }, 8000); return; } if(l.eb) try{ l.eb(e); }catch(x){} if(l.again){ l.again = false; rt.run(l); } });
    },
    changed: function(list){
      var paths = {}, colls = {}; (list || []).forEach(function(x){ paths[x.p] = 1; colls[x.c] = 1; });
      rt.ls.forEach(function(l, i){
        var hit = l.kind === 'doc' ? paths[l.path] : colls[l.coll];
        if(!hit) return;
        var k = l.kind + ':' + (l.path || l.coll) + ':' + i;   // تجميع التغييرات المتلاحقة في طلب واحد
        clearTimeout(rt.timers[k]); rt.timers[k] = setTimeout(function(){ rt.run(l); }, 150);
      });
    },
    /* بعد كتابة من نفس الجهاز: نحدّث فورًا من غير ما نستنى الإشعار */
    nudge: function(writes){ rt.changed((writes || []).map(function(w){ var p = String(w.path).split('/'); return {p: p.join('/'), c: p.slice(0, -1).join('/')}; })); },
    refreshAll: function(){ rt.ls.forEach(function(l){ rt.run(l); }); }
  };

  /* ---------- إشعارات الموبايل (Web Push مباشرة من السيرفر) ---------- */
  function b64u(buf){ var s = '', b = new Uint8Array(buf); for(var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function fromB64u(s){ s = s.replace(/-/g, '+').replace(/_/g, '/'); while(s.length % 4) s += '='; var r = atob(s), o = new Uint8Array(r.length); for(var i = 0; i < r.length; i++) o[i] = r.charCodeAt(i); return o; }
  var messagingObj = {
    getToken: function(opts){
      var reg = opts && opts.serviceWorkerRegistration;
      return (reg ? Promise.resolve(reg) : navigator.serviceWorker.ready).then(function(r){
        return call('GET', '/push/key').then(function(k){
          if(!k.publicKey) throw err('messaging/unsupported', 'push key missing');
          return r.pushManager.getSubscription().then(function(s){ return s || r.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: fromB64u(k.publicKey)}); });
        });
      }).then(function(sub){
        var j = sub.toJSON(); return crypto.subtle.digest('SHA-256', new TextEncoder().encode(j.endpoint)).then(function(h){
          var t = b64u(h); return call('POST', '/push/register', {token: t, subscription: j}).then(function(){ return t; });
        });
      });
    },
    deleteToken: function(){ return navigator.serviceWorker.ready.then(function(r){ return r.pushManager.getSubscription(); }).then(function(s){ return s ? s.unsubscribe() : true; }); },
    onMessage: function(){ return function(){}; }
  };

  var apps = {};
  function makeApp(name){ return {name: name, auth: function(){ return makeAuth(name !== '[DEFAULT]'); }, firestore: function(){ return db; }, messaging: function(){ return messagingObj; }}; }
  var firebase = {
    __local: true,   // التطبيق بيعرف منها إنه شغّال على السيرفر المحلي
    __api: function(method, url, body){ return call(method, url, body); },   // نداءات السيرفر المحلي المباشرة (زي المحلّل الذكي)
    /* إضافة/تعديل عناصر في قايمة جوه مستند والنت مقطوع: بتتحفظ «دمج» وبتتبعت لما النت يرجع */
    __queueMerge: function(m){ return OFF.ready.then(function(){ return OFF.enqueue({t: 'm', m: m}); }); },
    __syncStatus: function(){ return {online: net.ok && navigator.onLine !== false, pending: OFF.pending(), sending: OFF.isFlushing()}; },
    initializeApp: function(cfg, name){ name = name || '[DEFAULT]'; if(!apps[name]) apps[name] = makeApp(name); return apps[name]; },
    app: function(name){ name = name || '[DEFAULT]'; if(!apps[name]) throw err('app/no-app'); return apps[name]; },
    auth: function(){ return firebase.app().auth(); },
    firestore: function(){ return db; },
    messaging: function(){ return messagingObj; }
  };
  firebase.firestore.FieldValue = FieldValue;
  firebase.messaging.isSupported = function(){ return !!(window.PushManager && navigator.serviceWorker); };
  window.firebase = firebase;
  bootAuth();
})();
