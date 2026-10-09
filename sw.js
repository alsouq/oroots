/* O'Roots service worker — لإشعارات الجهاز (showNotification) */
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(list){
    for(var i=0;i<list.length;i++){ if('focus' in list[i]) return list[i].focus(); }
    if(self.clients.openWindow) return self.clients.openWindow('./');
  }));
});
/* جاهز لو اتفعّل الإرسال من السيرفر (FCM) بعدين */
self.addEventListener('push', function(e){
  var d = {}; try{ d = e.data ? e.data.json() : {}; }catch(x){}
  e.waitUntil(self.registration.showNotification(d.title || "O'Roots", {body:d.body || '', dir:'rtl', lang:'ar', tag:d.tag || 'oroots'}));
});
