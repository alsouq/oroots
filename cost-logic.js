/* O'Roots — حسابات التكاليف والكهرباء والشتلات (دوال نقية من غير DOM ولا Firebase).
   الكود اللي بين COSTLOGIC-BEGIN و COSTLOGIC-END منسوخ حرفيًا جوه index.html، والاختبار (tests/cost-logic.test.js) بيتأكد إنهم متطابقين.
   غيّر هنا وشغّل i18n/build_i18n.py (أو انسخ البلوك يدوي). */
/*COSTLOGIC-BEGIN*/
  function clNum(v){ var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function clMin(t){ var m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? parseInt(m[1], 10)*60 + parseInt(m[2], 10) : null; }
  /* دقايق التشغيل في برنامج ورقيات: فترة (من/إلى) بيتكرر جواها "شغّل X / اقفل Y" */
  function clProgOnMin(pr){
    var a = clMin(pr && pr.from), b = clMin(pr && pr.to), on = clNum(pr && pr.onMin), off = clNum(pr && pr.offMin);
    if(a === null || b === null || on <= 0) return 0;
    var win = b - a; if(win <= 0) win += 1440;
    var period = on + Math.max(0, off), full = Math.floor(win/period), rem = win - full*period;
    return full*on + Math.min(rem, on);
  }
  /* دقايق تشغيل المضخة في اليوم: ثمريات (كل X لمدة Y بين من/إلى) أو ورقيات (برامج) */
  function clPumpDailyMin(plan, fruit){
    plan = plan || {};
    if(fruit){
      var every = clNum(plan.every), everyMin = plan.unit === 'm' ? every : every*60, run = clNum(plan.runMin), a = clMin(plan.from), b = clMin(plan.to), n = 0;
      if(everyMin > 0 && run > 0 && a !== null && b !== null){ if(b < a) b += 1440; for(var t = a; t <= b && n < 96; t += everyMin) n++; }
      return run*n;
    }
    return (plan.programs || []).reduce(function(s, pr){ return s + (pr && pr.enabled === false ? 0 : clProgOnMin(pr)); }, 0);
  }
  /* الجدول اللي كان ساري يوم معيّن: آخر نسخة في hist تاريخها <= اليوم، وقبل أول نسخة بنستخدم أول نسخة (أو الجدول الحالي) */
  function clPlanAt(plan, day){
    var h = (plan && Array.isArray(plan.hist)) ? plan.hist.slice().sort(function(x, y){ return String(x.d).localeCompare(String(y.d)); }) : [];
    if(!h.length) return plan || {};
    var pick = null;
    for(var i = 0; i < h.length; i++){ if(String(h[i].d) <= day) pick = h[i]; }
    return (pick || h[0]).p || plan;
  }
  /* بيضيف نسخة للجدول في التاريخ (لو فيه نسخة بنفس اليوم بيستبدلها) وبيحتفظ بآخر max نسخة */
  function clPlanHistPush(prevHist, day, snap, max){
    var h = (Array.isArray(prevHist) ? prevHist : []).filter(function(x){ return x && x.d !== day; });
    h.push({d:day, p:snap});
    h.sort(function(x, y){ return String(x.d).localeCompare(String(y.d)); });
    return h.slice(-(max || 60));
  }
  /* كيلوواط ساعة لمضخة على مدار أيام (كل يوم بجدوله) */
  function clPumpKwh(plan, fruit, kw, days){
    var kwh = 0, mins = 0;
    (days || []).forEach(function(d){ var m = clPumpDailyMin(clPlanAt(plan, d), fruit); mins += m; kwh += clNum(kw)*m/60; });
    return {kwh:kwh, minutes:mins, avgDailyMin:(days && days.length) ? mins/days.length : 0};
  }
  /* محاكاة الأجهزة اللي بتشتغل بالحرارة (مراوح/خلايا تبريد).
     pts: [{t:ms, v:temp}] مترتبة. devs: [{w, on, fromH, toH, idx, name, kind}]. dayStarts: [ms لبداية كل يوم]. */
  function clSimDevices(pts, devs, dayStarts, hyst, nowMs){
    var GAP = 8*3600000, STEP = 10*60000, idx = 0, runs = [];
    var st = devs.map(function(d){ var w = clNum(d.w), on = parseFloat(d.on); return {d:d, w:w, on:on, ok:(w > 0 && isFinite(on)), isOn:false, run:null, min:0, nowOn:false, nowTemp:null}; });
    var tempAt = function(t){
      if(!pts.length) return null;
      while(idx + 1 < pts.length && pts[idx+1].t <= t) idx++;
      var a = pts[idx], b = pts[idx+1];
      if(a.t > t) return null;
      if(!b) return (t - a.t < 3600000) ? a.v : null;
      if(b.t - a.t > GAP) return null;
      return a.v + (b.v - a.v)*(t - a.t)/(b.t - a.t);
    };
    (dayStarts || []).forEach(function(t0){
      for(var k = 0; k < 144; k++){
        var t = t0 + k*STEP, v = tempAt(t), hr = k/6;
        st.forEach(function(x){
          if(!x.ok) return;
          var h1 = parseFloat(x.d.fromH), h2 = parseFloat(x.d.toH), inWin = true;
          if(isFinite(h1) && isFinite(h2) && h1 !== h2) inWin = h1 < h2 ? (hr >= h1 && hr < h2) : (hr >= h1 || hr < h2);
          var want = x.isOn;
          if(v === null || !inWin) want = false;
          else if(!x.isOn && v >= x.on) want = true;
          else if(x.isOn && v < x.on - clNum(hyst)) want = false;
          if(want && !x.isOn) x.run = {idx:x.d.idx, name:x.d.name, kind:x.d.kind, w:x.w, from:t, to:t};
          if(want){ x.min += 10; x.run.to = t + STEP; }
          if(!want && x.isOn && x.run){ runs.push(x.run); x.run = null; }
          x.isOn = want;
          if(t <= nowMs && nowMs < t + STEP){ x.nowOn = want; x.nowTemp = v; }
        });
      }
    });
    st.forEach(function(x){ if(x.run){ runs.push(x.run); x.run = null; } });
    runs.forEach(function(r){ r.min = Math.round((r.to - r.from)/60000); r.kwh = r.w/1000*r.min/60; });
    return {devs:st.map(function(x){ return {d:x.d, ok:x.ok, min:x.min, kwh:x.ok ? x.w/1000*x.min/60 : 0, nowOn:x.nowOn, nowTemp:x.nowTemp}; }), runs:runs};
  }
  /* تكلفة الصينية: بيئة (لترات × تكلفة لتر البيئة) + بذور (خلايا × بذور/خلية × سعر الألف) */
  function clTrayCost(cfg, cropKeyFn, cropName, traySize){
    cfg = cfg || {};
    var k = cropKeyFn(cropName), row = (cfg.seeds || []).filter(function(x){ return cropKeyFn(x.crop) === k; })[0];
    var perL = (cfg.items || []).reduce(function(a, x){ return a + clNum(x.qty)*clNum(x.price); }, 0);
    var seed = row ? traySize*(clNum(row.perCell) || 1)*clNum(row.per1000)/1000 : 0, medium = clNum(cfg.liters)*perL;
    return {seed:seed, medium:medium, total:seed + medium, perLiter:perL};
  }
  /* مطابقة تكلفة الشتلات مع الحصاد: كل دفعة تكلفتها بتتقسم بالتساوي على سجلات الحصاد اللي مربوطة بيها.
     links: {harvestId: [batchId...]}. batchCost: {batchId: {seed, medium}}. بيرجّع {perHarvest:{hid:{seed,medium}}, used:{batchId:true}} */
  function clMatchNursery(links, batchCost){
    var count = {}, per = {}, used = {};
    Object.keys(links || {}).forEach(function(h){ (links[h] || []).forEach(function(b){ count[b] = (count[b] || 0) + 1; }); });
    Object.keys(links || {}).forEach(function(h){
      var o = {seed:0, medium:0};
      (links[h] || []).forEach(function(b){ var c = batchCost[b]; if(!c || !count[b]) return; o.seed += c.seed/count[b]; o.medium += c.medium/count[b]; used[b] = true; });
      per[h] = o;
    });
    return {perHarvest:per, used:used};
  }
  /* نسبة فاقد الفرز لكل منتج: (اللي جه − بعد الفرز) ÷ اللي جه. sessions: [{items:[{product, received, sorted}]}] */
  function clWasteByProduct(sessions, productOf, fromDay){
    var acc = {};
    (sessions || []).forEach(function(s){
      if(fromDay && String(s.date || '') < fromDay) return;
      (s.items || []).forEach(function(it){
        var rec = clNum(it.received), srt = clNum(it.sorted); if(!(rec > 0)) return;
        var p = productOf(it.product), a = acc[p] || (acc[p] = {rec:0, waste:0});
        a.rec += rec; a.waste += Math.max(0, rec - srt);
      });
    });
    var out = {}; Object.keys(acc).forEach(function(p){ out[p] = acc[p].rec > 0 ? acc[p].waste/acc[p].rec : 0; });
    return out;
  }

  /* ---------- خزانات الري: حجم المياه المضافة من قياسين بالسنتيمتر ----------
     dim = {lengthCm, widthCm, count (عدد الخزانات المتصلة المتساوية، افتراضي 1), mode: 'height' (ارتفاع المياه) أو 'gap' (المسافة من حرف الخزان لسطح المياه)}.
     الفرق في الارتفاع × الطول × العرض ÷ 1000 = لتر. بيرجّع null لو الأبعاد أو القياسات ناقصة، و{cm, liters} غير كده (liters سالبة = القياس غلط). */
  function clTankAdded(dim, before, after){
    dim = dim || {};
    var L = clNum(dim.lengthCm), W = clNum(dim.widthCm), n = Math.max(1, Math.round(clNum(dim.count)) || 1);
    var b = parseFloat(before), a = parseFloat(after);
    if(!(L > 0 && W > 0) || !isFinite(a) || !isFinite(b)) return null;
    var cm = dim.mode === 'gap' ? (b - a) : (a - b);
    return {cm:Math.round(cm*100)/100, liters:Math.round(cm*L*W*n/1000*10)/10};
  }
  /* تكلفة المياه: لتر × سعر المتر المكعب ÷ 1000 */
  function clWaterCost(liters, pricePerM3){ var l = clNum(liters), p = clNum(pricePerM3); return (l > 0 && p > 0) ? Math.round(l/1000*p*100)/100 : 0; }

  /* ---------- لقطة المواسير: فاضي / منزرع / لكل صنف ----------
     map = {totalPipes, groups:[{crop, pipes}], rows:[{crop, plants}]} (نظام ثمريات: صفوف بدل مواسير) */
  function clPipeSnap(map){
    map = map || {};
    var total = clNum(map.totalPipes), by = {}, planted = 0;
    (map.groups || []).forEach(function(g){ var n = clNum(g && g.pipes); if(n > 0){ var k = (g.crop || '—'); planted += n; by[k] = (by[k] || 0) + n; } });
    var rows = (map.rows || []).filter(function(r){ return r && clNum(r.plants) > 0; }), plants = 0, rowsBy = {};
    rows.forEach(function(r){ var k = (r.crop || '—'); plants += clNum(r.plants); rowsBy[k] = (rowsBy[k] || 0) + clNum(r.plants); });
    var snap = {total:total, planted:planted, empty:Math.max(0, total - planted), byCrop:by};
    if(rows.length){ snap.rows = rows.length; snap.plants = plants; snap.rowsByCrop = rowsBy; }
    return snap;
  }
  /* أحدث لقطة تاريخها <= اليوم (snaps مرتّبة بالتاريخ تصاعدي). لو اليوم قبل أول لقطة: null (مفيش بيانات) */
  function clSnapOn(snaps, day){
    var pick = null;
    for(var i = 0; i < (snaps || []).length; i++){ if(String(snaps[i].date) <= day) pick = snaps[i]; else break; }
    return pick;
  }

  /* ---------- DLI: تقدير اليوم اللي قراءاته ناقصة من DLI الطقس × نسبة الصوبة ----------
     days: [{date, dli (المقاس أو null), complete (القراءات بتغطي النهار)، out (DLI الطقس برّه أو null)}].
     النسبة r = DLI الصوبة ÷ DLI برّه من الأيام المكتملة بس. تقدير يوم معيّن = متوسط مرجّح للنسب اللي قبله
     (إمبارح وزنه الأكبر وكل يوم أقدم وزنه أقل بالنص كل halfLife يوم)، فبيتعدّل لوحده مع كل قراءة جديدة. */
  var CL_DLI_EDGE_H = 3, CL_DLI_GAP_H = 3;
  /* القراءات (بالمللي ثانية، جوه الشروق والغروب فقط) بتغطي النهار؟ لا تقل عن 4 قراءات، وأول قراءة قريبة من الشروق وآخر قراءة قريبة من الغروب، ومفيش فجوة أكبر من 3 ساعات */
  function clDayComplete(times, rise, set){
    var t = (times || []).filter(function(x){ return isFinite(x) && x >= rise && x <= set; }).sort(function(a, b){ return a - b; });
    if(t.length < 4) return false;
    if(t[0] - rise > CL_DLI_EDGE_H*3600000 || set - t[t.length - 1] > CL_DLI_EDGE_H*3600000) return false;
    for(var i = 1; i < t.length; i++){ if(t[i] - t[i - 1] > CL_DLI_GAP_H*3600000) return false; }
    return true;
  }
  function clDayDiff(a, b){ var p = String(a).split('-'), q = String(b).split('-'); return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(+q[0], +q[1] - 1, +q[2]))/86400000); }
  function clDliK(days, date, halfLife, windowDays){
    halfLife = halfLife || 2; windowDays = windowDays || 30;
    var rs = [];
    (days || []).forEach(function(d){
      if(d.date === date || !d.complete || !(clNum(d.dli) > 0) || !(clNum(d.out) > 1)) return;
      rs.push({date:d.date, r:d.dli/d.out});
    });
    var prev = rs.filter(function(x){ var g = clDayDiff(date, x.date); return g > 0 && g <= windowDays; });
    var use = prev.length ? prev : rs.filter(function(x){ return Math.abs(clDayDiff(date, x.date)) <= windowDays; });   // أول أيام من غير تاريخ قبلها: أقرب أيام بعدها
    if(!use.length) return {k:null, n:0};
    var num = 0, den = 0;
    use.forEach(function(x){ var g = Math.abs(clDayDiff(date, x.date)), w = Math.pow(0.5, (g - 1)/halfLife); num += w*x.r; den += w; });
    return {k:num/den, n:use.length};
  }
  /* بيرجّع لكل يوم {date, dli, kind: 'measured' | 'est' | 'partial', k} — measured = قراءات كاملة، est = تقدير من الطقس، partial = قراءات ناقصة ومفيش طقس نقدّر بيه */
  function clDliSeries(days){
    return (days || []).slice().sort(function(a, b){ return String(a.date).localeCompare(String(b.date)); }).map(function(d){
      var m = clNum(d.dli) > 0 ? d.dli : null;
      if(d.complete && m !== null) return {date:d.date, dli:m, kind:'measured', k:null};
      var o = clNum(d.out) > 0 ? d.out : null, kk = o !== null ? clDliK(days, d.date) : {k:null, n:0};
      if(o !== null && kk.k !== null) return {date:d.date, dli:Math.round(kk.k*o*100)/100, kind:'est', k:kk.k, n:kk.n};
      if(m !== null) return {date:d.date, dli:m, kind:'partial', k:null};
      return null;
    }).filter(Boolean);
  }
/*COSTLOGIC-END*/
if(typeof module !== 'undefined') module.exports = {clTankAdded:clTankAdded, clWaterCost:clWaterCost, clPipeSnap:clPipeSnap, clSnapOn:clSnapOn, clDayComplete:clDayComplete, clDliK:clDliK, clDliSeries:clDliSeries, clNum:clNum, clMin:clMin, clProgOnMin:clProgOnMin, clPumpDailyMin:clPumpDailyMin, clPlanAt:clPlanAt, clPlanHistPush:clPlanHistPush, clPumpKwh:clPumpKwh, clSimDevices:clSimDevices, clTrayCost:clTrayCost, clMatchNursery:clMatchNursery, clWasteByProduct:clWasteByProduct};
