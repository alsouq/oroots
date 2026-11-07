/* O'Roots — منطق مشترك (التطبيق + سكربت السيرفر): القراءات الشاذة + مخاطر الأمراض من المناخ.
   الكود اللي بين علامتي LOGIC-BEGIN / LOGIC-END منسوخ حرفيًا جوه index.html، وفي اختبار (tests/farm-logic.test.js) بيتأكد إنهم متطابقين. غيّر هنا وانسخ هناك. */
/*LOGIC-BEGIN*/
  /* ts = 'YYYY-MM-DDTHH:MM' بتوقيت المزرعة؛ بنقارنهم كأنهم UTC عشان الفروق تفضل بالساعات الصح */
  function lgTs(ts){ return Date.parse(String(ts).slice(0, 16) + ':00Z'); }
  function lgNum(v){ v = parseFloat(v); return isFinite(v) ? v : null; }
  /* ساعات (آخر 24 ساعة) اللي الحرارة والرطوبة فيها اتحققوا بشرط معيّن؛ كل قراءة بتمثّل الفترة لحد القراءة اللي بعدها (بحد أقصى 3 ساعات) */
  function lgRiskHours(entries, nowMs, test){
    var from = nowMs - 24*3600000, cap = 3*3600000, h = 0, e = (entries || []).slice().sort(function(a, b){ return String(a.ts).localeCompare(String(b.ts)); });
    for(var i = 0; i < e.length; i++){
      var t = lgTs(e[i].ts), temp = lgNum(e[i].temp), rh = lgNum(e[i].rh);
      if(!(t <= nowMs) || temp === null || rh === null) continue;
      var next = i + 1 < e.length ? lgTs(e[i+1].ts) : nowMs, start = Math.max(t, from), span = Math.min(Math.max(next - start, 0), cap);
      if(test(temp, rh)) h += span / 3600000;
    }
    return Math.round(h * 10) / 10;
  }
  /* العتبات الافتراضية (قابلة للتعديل من الإعدادات): حرارة من/إلى، رطوبة من/إلى، وساعات الخطر المتوسط والعالي في آخر 24 ساعة */
  var LG_DISEASES = [
    {id:'botrytis', name:'العفن الرمادي (بوترايتس)', tMin:15, tMax:23, rhMin:90, rhMax:100, med:3, high:6, tip:'قلّل الرطوبة بالتهوية والتسخين الخفيف قبل الفجر، وتجنّب الرش المسائي.'},
    {id:'downy', name:'البياض الزغبي', tMin:10, tMax:24, rhMin:85, rhMax:100, med:4, high:8, tip:'زوّد حركة الهواء وقلّل الرطوبة الليلية وراجع الأوراق السفلية.'},
    {id:'powdery', name:'البياض الدقيقي (تقدير استرشادي)', tMin:22, tMax:28, rhMin:70, rhMax:90, med:10, high:16, tip:'راجع الأوراق القديمة وظلّل الإصابات المبكرة، وفكّر في وقاية بالكبريت أو بديل حيوي.'}
  ];
  /* over = {botrytis:{tMin,tMax,rhMin,rhMax,med,high,on}, ...} (اختياري): أي حقل مش رقم صالح بيرجع للافتراضي، و on:false بيقفل المرض */
  function lgDiseaseCfg(d, over){
    var o = (over && over[d.id]) || {}, c = {id:d.id, name:d.name, tip:d.tip, on:o.on !== false};
    ['tMin', 'tMax', 'rhMin', 'rhMax', 'med', 'high'].forEach(function(k){ var v = parseFloat(o[k]); c[k] = isFinite(v) ? v : d[k]; });
    if(c.high < c.med) c.high = c.med;
    return c;
  }
  /* مخاطر الأمراض لصوبة واحدة من قراءات مناخها: [{id, name, level:'medium'|'high', hours, tip}] (تقدير استرشادي مش تشخيص) */
  function lgDiseaseRisks(entries, nowMs, over){
    var out = [];
    LG_DISEASES.forEach(function(d0){
      var d = lgDiseaseCfg(d0, over); if(!d.on) return;
      var h = lgRiskHours(entries, nowMs, function(t, r){ return t >= d.tMin && t <= d.tMax && r >= d.rhMin && r <= d.rhMax; });
      if(h >= d.high) out.push({id:d.id, name:d.name, level:'high', hours:h, tip:d.tip});
      else if(h >= d.med) out.push({id:d.id, name:d.name, level:'medium', hours:h, tip:d.tip});
    });
    return out;
  }
  /* قراءات شاذة: قيمة ثابتة 6 قراءات فأكتر في آخر 48 ساعة، أو انجراف في اتجاه واحد على 4 أيام فأكتر */
  var LG_DRIFT_MIN = {ph:0.6, ec:0.6, temp:4, moist:15, rh:15};
  var LG_LABEL = {ph:'pH', ec:'EC', temp:'الحرارة', moist:'رطوبة التربة', rh:'الرطوبة النسبية', lux:'الإضاءة'};
  function lgAnomalies(entries, keys, nowMs){
    var out = [], e = (entries || []).slice().sort(function(a, b){ return String(a.ts).localeCompare(String(b.ts)); });
    var recent = e.filter(function(x){ var t = lgTs(x.ts); return t >= nowMs - 48*3600000 && t <= nowMs; });
    keys.forEach(function(k){
      var vals = recent.map(function(x){ return lgNum(x[k]); }).filter(function(v){ return v !== null; });
      if(vals.length >= 6 && vals.every(function(v){ return v === vals[0]; })) out.push({k:k, type:'flat', text:LG_LABEL[k] + ' ثابتة على ' + vals[0] + ' في آخر ' + vals.length + ' قراءات — اتأكد من الحساس أو إن القراءة مش بتتنسخ'});
      var byDay = {}; e.forEach(function(x){ var v = lgNum(x[k]); if(v !== null) byDay[String(x.ts).slice(0, 10)] = v; });
      var days = Object.keys(byDay).sort().slice(-5), dv = days.map(function(d){ return byDay[d]; });
      if(dv.length >= 4){
        var up = true, down = true;
        for(var i = 1; i < dv.length; i++){ if(!(dv[i] > dv[i-1])) up = false; if(!(dv[i] < dv[i-1])) down = false; }
        var total = dv[dv.length-1] - dv[0], min = LG_DRIFT_MIN[k];
        if((up || down) && min && Math.abs(total) >= min) out.push({k:k, type:'drift', text:LG_LABEL[k] + ' بتتحرك في اتجاه واحد ' + (up ? 'لفوق' : 'لتحت') + ' ' + dv.length + ' أيام (من ' + (Math.round(dv[0]*100)/100) + ' لـ ' + (Math.round(dv[dv.length-1]*100)/100) + ')'});
      }
    });
    return out;
  }

  /* ===== احتياج النبات للمياه من المناخ: FAO-56 Penman-Monteith بالساعة (ET0) × معامل المحصول Kc ===== */
  /* T حرارة °C، RH رطوبة %، RsWm2 إشعاع W/m²، u2 سرعة الهواء م/ث. بيرجّع ملم/ساعة (= لتر لكل م² في الساعة) */
  function lgEt0(T, RH, RsWm2, u2, day){
    var es = 0.6108 * Math.exp(17.27 * T / (T + 237.3)), ea = es * Math.min(Math.max(RH, 1), 100) / 100, vpd = Math.max(es - ea, 0);
    var delta = 4098 * es / Math.pow(T + 237.3, 2), gamma = 0.0674;
    var rn = day ? 0.75 * RsWm2 * 0.0036 : 0, g = day ? 0.1 * rn : 0, cd = day ? 0.34 : 0.96;   // Rn بالـ MJ/m²/h (صافي الإشعاع ≈ 75٪ من الإشعاع الداخلي)
    var num = 0.408 * delta * (rn - g) + gamma * (37 / (T + 273)) * u2 * vpd;
    return Math.max(num / (delta + gamma * (1 + cd * u2)), 0);
  }
  function lgHHMM(hours){ var m = Math.round(hours * 12) * 5; m = ((m % 1440) + 1440) % 1440; return (m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60); }
  /* hours: 24 عنصر {h, T, RH, Rs}. o: {kc, density (نبات/م²), leach (٪ غسيل)، plants (عدد نباتات النظام)، eventMl (حجم الرية المستهدف لكل نبتة بالمل)، totalLpm (تصرف النظام لتر/دقيقة)، u2}
     بيرجّع: rows بالساعة (مل/نبتة)، الإجمالي اليومي، الذروة، وبداية/نهاية الري وجدول ريات موزّع على قد الاحتياج (أكتر وقت الظهيرة) */
  function lgIrrigPlan(hours, o){
    var u2 = o.u2 > 0 ? o.u2 : 0.5, kc = o.kc > 0 ? o.kc : 1, dens = o.density > 0 ? o.density : 1, lf = Math.min(Math.max((o.leach || 0) / 100, 0), 0.6);
    var rows = hours.map(function(x){
      var day = x.Rs > 1, et0 = lgEt0(x.T, x.RH, x.Rs, u2, day), etc = et0 * kc, es = 0.6108 * Math.exp(17.27 * x.T / (x.T + 237.3));
      return {h:x.h, T:x.T, RH:x.RH, Rs:x.Rs, day:day, vpd:Math.max(es - es * Math.min(Math.max(x.RH, 1), 100) / 100, 0), et0:et0, etc:etc, ml:etc / dens * 1000 / (1 - lf)};
    });
    var tot = rows.reduce(function(a, r){ return a + r.ml; }, 0), peak = rows.reduce(function(b, r){ return r.ml > b.ml ? r : b; }, rows[0]);
    var dayRows = rows.filter(function(r){ return r.day; }); if(!dayRows.length) dayRows = rows;       // الريات بتتوزّع على ساعات النهار بس (لو مفيش نهار بنستخدم كل الساعات)
    var dayTot = dayRows.reduce(function(a, r){ return a + r.ml; }, 0), first = dayRows[0].h, last = dayRows[dayRows.length - 1].h + 1;
    var n = o.eventMl > 0 && tot > 0 ? Math.max(1, Math.min(24, Math.round(tot / o.eventMl))) : 0, events = [];
    if(dayTot > 0 && n){
      var cum = [0]; dayRows.forEach(function(r){ cum.push(cum[cum.length - 1] + r.ml); });
      var at = function(f){ var t = f * dayTot; for(var i = 0; i < dayRows.length; i++){ if(cum[i + 1] >= t){ var sp = cum[i + 1] - cum[i]; return dayRows[i].h + (sp > 0 ? (t - cum[i]) / sp : 0); } } return last; };
      for(var k = 0; k < n; k++){ var ml = tot / n, liters = ml * (o.plants || 0) / 1000; events.push({t:lgHHMM(at(0.05 + 0.9 * (k + 0.5) / n)), ml:ml, liters:liters, minutes:(o.totalLpm > 0 && liters > 0) ? liters / o.totalLpm : null}); }
    }
    return {rows:rows, dailyMl:tot, dayMl:dayTot, peak:peak, n:n, start:lgHHMM(first), end:lgHHMM(last), events:events};
  }
/*LOGIC-END*/
module.exports = (function(){ return {lgTs: lgTs, lgRiskHours: lgRiskHours, lgDiseaseRisks: lgDiseaseRisks, lgDiseaseCfg: lgDiseaseCfg, LG_DISEASES: LG_DISEASES, lgAnomalies: lgAnomalies, lgEt0: lgEt0, lgIrrigPlan: lgIrrigPlan, lgHHMM: lgHHMM}; })();
