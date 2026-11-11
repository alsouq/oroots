/* اختبار حسابات التكاليف والكهرباء والشتلات (cost-logic.js) + تطابق نسخة index.html */
const assert = require('assert'), fs = require('fs'), path = require('path');
const L = require('../cost-logic.js');
const blk = (s) => s.slice(s.indexOf('/*COSTLOGIC-BEGIN*/'), s.indexOf('/*COSTLOGIC-END*/') + '/*COSTLOGIC-END*/'.length);
assert.strictEqual(blk(fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8')), blk(fs.readFileSync(path.join(__dirname, '../cost-logic.js'), 'utf8')), 'منطق التكاليف في index.html مختلف عن cost-logic.js');
const near = (a, b, msg) => assert(Math.abs(a - b) < 1e-6, msg + ': ' + a + ' ≠ ' + b);

// برامج الورقيات: من 6 لـ 18 شغّل 10 واقفل 50 = 12 دورة × 10 دقايق
assert.strictEqual(L.clProgOnMin({from:'06:00', to:'18:00', onMin:10, offMin:50}), 120);
assert.strictEqual(L.clProgOnMin({from:'06:00', to:'06:25', onMin:10, offMin:10}), 15);            // آخر دورة ناقصة
assert.strictEqual(L.clProgOnMin({from:'22:00', to:'02:00', onMin:30, offMin:30}), 120);           // بتعدّي نص الليل
assert.strictEqual(L.clPumpDailyMin({programs:[{from:'06:00', to:'18:00', onMin:10, offMin:50}, {from:'06:00', to:'18:00', onMin:10, offMin:50, enabled:false}]}, false), 120);
// ثمريات: كل ساعتين من 6 لـ 18 = 7 ريّات × 5 دقايق
assert.strictEqual(L.clPumpDailyMin({every:2, unit:'h', runMin:5, from:'06:00', to:'18:00'}, true), 35);
assert.strictEqual(L.clPumpDailyMin({every:30, unit:'m', runMin:2, from:'08:00', to:'09:00'}, true), 6);
assert.strictEqual(L.clPumpDailyMin({every:0, runMin:5, from:'06:00', to:'18:00'}, true), 0);

// تاريخ جدول الري
let h = L.clPlanHistPush([], '2026-11-01', {runMin:5, every:2, unit:'h', from:'06:00', to:'18:00'});
h = L.clPlanHistPush(h, '2026-11-05', {runMin:10, every:2, unit:'h', from:'06:00', to:'18:00'});
h = L.clPlanHistPush(h, '2026-11-05', {runMin:8, every:2, unit:'h', from:'06:00', to:'18:00'});   // نفس اليوم بيستبدل
assert.strictEqual(h.length, 2);
const plan = {runMin:8, every:2, unit:'h', from:'06:00', to:'18:00', hist:h};
assert.strictEqual(L.clPlanAt(plan, '2026-10-20').runMin, 5);   // قبل أول نسخة = أول نسخة
assert.strictEqual(L.clPlanAt(plan, '2026-11-03').runMin, 5);
assert.strictEqual(L.clPlanAt(plan, '2026-11-05').runMin, 8);
assert.strictEqual(L.clPlanAt({runMin:3}, '2026-11-05').runMin, 3);   // من غير تاريخ = الجدول الحالي
assert.strictEqual(L.clPlanHistPush(Array.from({length:70}, (_, i) => ({d:'2026-01-' + String(i).padStart(2, '0'), p:{}})), '2026-12-01', {}, 60).length, 60);
// كيلوواط: 3 أيام بالجدول القديم (35 دقيقة) + يومين بالجديد (56 دقيقة)، مضخة 1.2 ك.و
const k = L.clPumpKwh(plan, true, 1.2, ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
near(k.minutes, 3*35 + 2*56, 'دقايق المضخة');
near(k.kwh, 1.2*(3*35 + 2*56)/60, 'كيلوواط المضخة');

// محاكاة المروحة: الحرارة من 20 (الساعة 0) لـ 30 (الساعة 5) خطي؛ تشتغل عند 26 → من 3:00 لـ 5:00 + ساعة بعد آخر قراءة
const H = 3600000, t0 = Date.UTC(2026, 10, 1), pts = [{t:t0, v:20}, {t:t0 + 5*H, v:30}];
let r = L.clSimDevices(pts, [{w:1000, on:26, idx:0}], [t0], 1, 0);
assert.strictEqual(r.devs[0].min, 180, 'دقايق تشغيل المروحة');
near(r.devs[0].kwh, 3, 'كيلوواط المروحة');
assert.strictEqual(r.runs.length, 1);
// فترة التشغيل المسموحة (من 4 لـ 24) بتقصّ التشغيل
r = L.clSimDevices(pts, [{w:1000, on:26, fromH:4, toH:24, idx:0}], [t0], 1, 0);
assert.strictEqual(r.devs[0].min, 120);
// جهاز ناقص بيانات ما بيتحسبش
r = L.clSimDevices(pts, [{w:0, on:26, idx:0}], [t0], 1, 0);
assert.strictEqual(r.devs[0].ok, false); assert.strictEqual(r.devs[0].kwh, 0);
// فرق الإطفاء: بيقف بس لما تنزل تحت 26 − 2
const pts2 = [{t:t0, v:27}, {t:t0 + H, v:25}, {t:t0 + 2*H, v:23}];
r = L.clSimDevices(pts2, [{w:1000, on:26, idx:0}], [t0], 2, 0);
assert.strictEqual(r.devs[0].min, 100, 'فرق الإطفاء');   // 27→23 خطي: بيقف أول ما تنزل تحت 24 (الساعة 1:40)
// فجوة أكبر من 8 ساعات = مجهول (الجهاز واقف)
r = L.clSimDevices([{t:t0, v:30}, {t:t0 + 10*H, v:30}], [{w:1000, on:26, idx:0}], [t0], 1, 0);
assert.strictEqual(r.devs[0].min, 60);
// الحالة دلوقتي
r = L.clSimDevices(pts, [{w:1000, on:26, idx:0}], [t0], 1, t0 + 4*H + 60000);
assert.strictEqual(r.devs[0].nowOn, true); near(r.devs[0].nowTemp, 28, 'الحرارة دلوقتي');

// تكلفة الصينية
const key = (n) => String(n || '').trim().toLowerCase();
const cfg = {liters:0.6, items:[{qty:0.5, price:20}, {qty:0.25, price:10}], seeds:[{crop:'خس', per1000:50, perCell:1}]};
const tc = L.clTrayCost(cfg, key, ' خس ', 209);
near(tc.perLiter, 12.5, 'تكلفة لتر البيئة'); near(tc.medium, 7.5, 'بيئة الصينية'); near(tc.seed, 10.45, 'بذور الصينية');
near(L.clTrayCost(cfg, key, 'ريحان', 209).seed, 0, 'صنف من غير سعر بذور');

// مطابقة الشتلات مع الحصاد: دفعة اتحصدت على قطفتين + دفعة لسه ما اتحصدتش
const m = L.clMatchNursery({h1:['b1'], h2:['b1', 'b2']}, {b1:{seed:10, medium:6}, b2:{seed:4, medium:2}, b3:{seed:9, medium:9}});
near(m.perHarvest.h1.seed, 5, 'نص الدفعة للقطفة الأولى'); near(m.perHarvest.h2.seed, 9, 'القطفة التانية'); near(m.perHarvest.h2.medium, 5, 'بيئة القطفة التانية');
assert(m.used.b1 && m.used.b2 && !m.used.b3, 'الدفعة اللي ما اتحصدتش = تحت الإنتاج');

// فاقد الفرز
const w = L.clWasteByProduct([{date:'2026-11-05', items:[{product:'خس', received:100, sorted:90}, {product:'خس بلدي', received:100, sorted:70}]}, {date:'2026-10-01', items:[{product:'خس', received:100, sorted:0}]}],
  (p) => /خس/.test(p) ? 'Lettuce' : 'x', '2026-11-01');
near(w.Lettuce, 0.2, 'نسبة الفاقد');
console.log('cost-logic OK');
