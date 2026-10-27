/* O'Roots service worker
   - الصفحة نفسها بتفتح فوراً من الجهاز (من غير انتظار الشبكة) وبتتحدّث في الخلفية.
   - مكتبات Firebase والخطوط بتتخزّن؛ طلبات البيانات (Firestore / Auth) بتعدّي عادي ومش بنلمسها.
   لما تنزّل نسخة جديدة من index.html بيظهر للمستخدم شريط "في نسخة جديدة" يحدّث بضغطة. */
var VER = 'v1';
var SHELL = 'oroots-shell-' + VER, LIBS = 'oroots-libs-' + VER;
var SCOPE = self.registration.scope;
var INDEX = new URL('index.html', SCOPE).href;
var PRECACHE = ['index.html', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png'].map(function(p){ return new URL(p, SCOPE).href; });

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then(function(c){
    return Promise.all(PRECACHE.map(function(u){
      return fetch(u, {cache:'reload'}).then(function(r){ if(r && r.ok) return c.put(u, r); }).catch(function(){});
    }));
  }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== SHELL && k !== LIBS; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function sig(r){ return r ? (r.headers.get('etag') || r.headers.get('last-modified') || r.headers.get('content-length') || '') : ''; }

/* بيجيب أحدث index.html من الشبكة ويخزّنه، ولو اتغيّر يبلّغ الصفحة */
function revalidateIndex(){
  return caches.open(SHELL).then(function(c){
    return c.match(INDEX).then(function(old){
      return fetch(INDEX, {cache:'no-cache'}).then(function(r){
        if(!r || !r.ok) return;
        var changed = !!old && sig(old) !== sig(r);
        return c.put(INDEX, r.clone()).then(function(){
          if(changed) return self.clients.matchAll().then(function(cs){ cs.forEach(function(cl){ cl.postMessage({type:'update-ready'}); }); });
        });
      }).catch(function(){});
    });
  });
}

function cacheFirst(name, req){
  return caches.open(name).then(function(c){
    return c.match(req).then(function(hit){
      return hit || fetch(req).then(function(r){ if(r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; });
    });
  });
}
function staleWhileRevalidate(name, req){
  return caches.open(name).then(function(c){
    return c.match(req).then(function(hit){
      var net = fetch(req).then(function(r){ if(r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(function(){ return hit; });
      return hit || net;
    });
  });
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);

  // 1) الصفحة نفسها: من الجهاز فوراً + تحديث في الخلفية
  if(req.mode === 'navigate' && url.href.indexOf(SCOPE) === 0){
    var net = revalidateIndex();
    e.waitUntil(net);
    e.respondWith(
      caches.open(SHELL).then(function(c){ return c.match(INDEX); }).then(function(hit){
        if(hit) return hit;
        return net.then(function(){ return caches.open(SHELL).then(function(c){ return c.match(INDEX); }); }).then(function(h){ return h || fetch(req); });
      })
    );
    return;
  }

  // 2) ملفات الموقع نفسه (أيقونات، manifest)
  if(url.origin === self.location.origin && url.href.indexOf(SCOPE) === 0){
    e.respondWith(staleWhileRevalidate(SHELL, req));
    return;
  }

  // 3) مكتبات Firebase (نسخة ثابتة) والخطوط
  if(url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0){
    e.respondWith(cacheFirst(LIBS, req));
    return;
  }
  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    e.respondWith(staleWhileRevalidate(LIBS, req));
    return;
  }
  // أي حاجة تانية (Firestore / Auth ...) بتعدّي للشبكة زي ما هي
});

/* ---------- إشعارات الـ push (تنبيه المهام كل ساعة، حتى والتطبيق مقفول) ---------- */
self.addEventListener('push', function(e){
  var d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(err){ d = {}; }
  var p = d.data || d;   // رسائل FCM بتيجي بالبيانات جوه .data
  var icon = new URL('icon-192.png', SCOPE).href;
  e.waitUntil(self.registration.showNotification(p.title || "O'Roots", {
    body: p.body || '', tag: p.tag || 'oroots-tasks', renotify: true, requireInteraction: true,
    dir: 'rtl', lang: 'ar', vibrate: [300, 150, 300, 150, 500], icon: icon, badge: icon,
    data: {url: p.url || SCOPE}
  }));
});
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || SCOPE;
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(cs){
    for(var i = 0; i < cs.length; i++){ if(cs[i].url.indexOf(SCOPE) === 0 && 'focus' in cs[i]) return cs[i].focus(); }
    return self.clients.openWindow(url);
  }));
});
