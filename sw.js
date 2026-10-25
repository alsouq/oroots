/* O'Roots service worker: يفتح التطبيق حتى لو النت ضعيف + إشعارات الجهاز */
var VERSION = 'oroots-v2';
var SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){ return c.addAll(SHELL).catch(function(){}); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k!==VERSION && k!==VERSION+'-ext'; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method!=='GET') return;
  var url = new URL(req.url);
  if(url.origin===location.origin){
    if(req.mode==='navigate'){
      /* الصفحة: من النت لو رد في ٢٫٥ ثانية، وإلا من النسخة المحفوظة (والنسخة الجديدة بتتحفظ في الخلفية) */
      e.respondWith(new Promise(function(resolve){
        var done = false;
        var t = setTimeout(function(){
          caches.match('index.html').then(function(c){ if(c && !done){ done = true; resolve(c); } });
        }, 2500);
        fetch(req).then(function(r){
          clearTimeout(t);
          var copy = r.clone(); caches.open(VERSION).then(function(c){ c.put('index.html', copy); });
          if(!done){ done = true; resolve(r); }
        }).catch(function(){
          clearTimeout(t);
          caches.match('index.html').then(function(c){ if(!done){ done = true; resolve(c || Response.error()); } });
        });
      }));
      return;
    }
    e.respondWith(caches.match(req).then(function(hit){
      return hit || fetch(req).then(function(r){ var copy = r.clone(); caches.open(VERSION).then(function(c){ c.put(req, copy); }); return r; });
    }));
    return;
  }
  /* مكتبات Firebase والخطوط: من الكاش وتتحدّث في الخلفية */
  if(/(^|\.)gstatic\.com$/.test(url.hostname) || url.hostname==='fonts.googleapis.com'){
    e.respondWith(caches.open(VERSION+'-ext').then(function(c){
      return c.match(req).then(function(hit){
        var net = fetch(req).then(function(r){ c.put(req, r.clone()); return r; }).catch(function(){ return hit; });
        return hit || net;
      });
    }));
  }
});
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(list){
    for(var i=0;i<list.length;i++){ if('focus' in list[i]) return list[i].focus(); }
    return self.clients.openWindow('./');
  }));
});
