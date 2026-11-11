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
/*COSTLOGIC-END*/
if(typeof module !== 'undefined') module.exports = {clNum:clNum, clMin:clMin, clProgOnMin:clProgOnMin, clPumpDailyMin:clPumpDailyMin, clPlanAt:clPlanAt, clPlanHistPush:clPlanHistPush, clPumpKwh:clPumpKwh, clSimDevices:clSimDevices, clTrayCost:clTrayCost, clMatchNursery:clMatchNursery, clWasteByProduct:clWasteByProduct};
