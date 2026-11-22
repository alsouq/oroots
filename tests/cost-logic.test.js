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

// خزانات الري: الحجم من قياسين بالسنتيمتر
let tkA = L.clTankAdded({lengthCm:200, widthCm:150, mode:'height'}, 30, 45);
assert.deepStrictEqual(tkA, {cm:15, liters:450});                       // 15 سم × 200 × 150 = 450 لتر
tkA = L.clTankAdded({lengthCm:200, widthCm:150, mode:'gap'}, 40, 25);   // المسافة من الحرف قلّت 15 سم = المياه زادت 15 سم
assert.deepStrictEqual(tkA, {cm:15, liters:450});
assert.strictEqual(L.clTankAdded({lengthCm:200, widthCm:150, mode:'gap', count:2}, 40, 25).liters, 900);   // خزانين متساويين متوصلين
assert(L.clTankAdded({lengthCm:200, widthCm:150}, 45, 30).liters < 0, 'قياس بعد أقل من قبل = سالب (القياس غلط)');
assert.strictEqual(L.clTankAdded({lengthCm:0, widthCm:150}, 30, 45), null);
assert.strictEqual(L.clTankAdded({lengthCm:200, widthCm:150}, '', 45), null);
assert.strictEqual(L.clTankAdded({lengthCm:123.4, widthCm:77.7}, 10.5, 22.25).liters, 112.7);   // التقريب لأقرب 0.1 لتر
near(L.clWaterCost(4500, 8), 36, 'تكلفة 4.5 متر مكعب بسعر 8');
assert.strictEqual(L.clWaterCost(450, 0), 0); assert.strictEqual(L.clWaterCost(-5, 8), 0);

// لقطة المواسير
const snA = L.clPipeSnap({totalPipes:300, groups:[{crop:'خس', pipes:80}, {crop:'خس', pipes:20}, {crop:'ريحان', pipes:100}, {crop:'x', pipes:0}]});
assert.deepStrictEqual(snA, {total:300, planted:200, empty:100, byCrop:{'خس':100, 'ريحان':100}});
assert.strictEqual(L.clPipeSnap({totalPipes:50, groups:[{crop:'a', pipes:80}]}).empty, 0, 'المنزرع أكتر من الإجمالي ⇒ الفاضي صفر مش سالب');
const frA = L.clPipeSnap({totalPipes:0, rows:[{crop:'طماطم شيري', plants:40}, {crop:'طماطم شيري', plants:38}, {crop:'بيف', plants:30}]});
assert.deepStrictEqual([frA.rows, frA.plants, frA.rowsByCrop['طماطم شيري']], [3, 108, 78]);
const snapsA = [{date:'2026-11-01', planted:10}, {date:'2026-11-05', planted:20}, {date:'2026-11-09', planted:5}];
assert.strictEqual(L.clSnapOn(snapsA, '2026-10-30'), null);
assert.strictEqual(L.clSnapOn(snapsA, '2026-11-01').planted, 10);
assert.strictEqual(L.clSnapOn(snapsA, '2026-11-07').planted, 20, 'يوم من غير لقطة = آخر لقطة قبله');
assert.strictEqual(L.clSnapOn(snapsA, '2026-12-01').planted, 5);

// DLI: اكتمال القراءات
const HR = 3600000, rise = Date.parse('2026-11-10T06:00:00Z'), set = Date.parse('2026-11-10T17:00:00Z'), at = h => rise + h*HR;
assert.strictEqual(L.clDayComplete([0.5, 3, 6, 9, 10.5].map(at), rise, set), true);
assert.strictEqual(L.clDayComplete([0.5, 3, 9, 10.5].map(at), rise, set), false, 'فجوة 6 ساعات');
assert.strictEqual(L.clDayComplete([4, 6, 8, 10.5].map(at), rise, set), false, 'أول قراءة بعد الشروق بـ 4 ساعات');
assert.strictEqual(L.clDayComplete([0.5, 3, 6].map(at), rise, set), false, 'أقل من 4 قراءات');
assert.strictEqual(L.clDayComplete([-2, 0.5, 3, 6, 9, 10.5, 13].map(at), rise, set), true, 'القراءات اللي برّه النهار بتتتجاهل');

// DLI: النسبة والتقدير
const D = (date, dli, complete, out) => ({date, dli, complete, out});
let daysA = [D('2026-11-01', 10, true, 20), D('2026-11-02', 9, true, 18), D('2026-11-03', 12, true, 24), D('2026-11-04', 4, false, 20), D('2026-11-05', null, false, 16)];
let serA = L.clDliSeries(daysA);
assert.deepStrictEqual(serA.map(x => x.kind), ['measured', 'measured', 'measured', 'est', 'est']);
near(serA[3].dli, 10, 'النسبة ثابتة 0.5 ⇒ التقدير 0.5 × 20');   // اليوم الناقص (قراءاته 4 بس) بيتقدّر مش بياخد المقاس
near(serA[4].dli, 8, 'يوم من غير قراءات خالص');
// النسبة بتتغيّر: إمبارح وزنه أكبر من اللي قبله
daysA = [D('2026-11-01', 10, true, 20), D('2026-11-02', 6, true, 20), D('2026-11-03', null, false, 20)];     // 0.5 ثم 0.3
let kA = L.clDliK(daysA, '2026-11-03'); near(kA.k, (0.3 + 0.5*Math.pow(0.5, 0.5))/(1 + Math.pow(0.5, 0.5)), 'متوسط مرجّح'); assert(kA.k < 0.4 && kA.k > 0.3);
assert.strictEqual(kA.n, 2);
// قراءة كاملة جديدة بتغيّر التقدير بتاع اليوم اللي بعده
let kB = L.clDliK(daysA.concat([D('2026-11-03', 14, true, 20), D('2026-11-04', null, false, 20)]), '2026-11-04'); assert(kB.k > kA.k, 'يوم 3 كان 0.7 فرفع النسبة');
// مفيش طقس ولا أيام مكتملة ⇒ بنرجع القراءات الناقصة زي ما هي
serA = L.clDliSeries([D('2026-11-01', 3, false, null), D('2026-11-02', null, false, 15)]);
assert.deepStrictEqual(serA.map(x => [x.date, x.kind]), [['2026-11-01', 'partial']], 'يوم 2 مفيهوش حاجة نبني عليها');
// أول يوم من غير تاريخ قبله: بياخد النسبة من الأيام اللي بعده
serA = L.clDliSeries([D('2026-11-01', null, false, 20), D('2026-11-02', 10, true, 20)]);
near(serA[0].dli, 10, 'نسبة من اليوم اللي بعده'); assert.strictEqual(serA[0].kind, 'est');
// يوم كامل ما بيتبدلش بتقدير
serA = L.clDliSeries([D('2026-11-01', 10, true, 20), D('2026-11-02', 7, true, 20)]); assert.deepStrictEqual(serA.map(x => x.dli), [10, 7]);
console.log('cost-logic OK');
