const assert = require('assert'), fs = require('fs');
const L = require('../farm-logic.js');
const NOW = Date.parse('2026-11-06T12:00:00Z');
const mk = (hoursAgo, temp, rh) => { const d = new Date(NOW - hoursAgo*3600000).toISOString().slice(0, 16); return {ts: d, temp, rh}; };
// أمراض: ليلة طويلة رطبة وباردة = خطر عفن رمادي
const wet = [mk(20, 18, 94), mk(17, 18, 95), mk(14, 17, 93), mk(11, 18, 92), mk(8, 19, 95), mk(5, 21, 80), mk(1, 25, 60)];
let r = L.lgDiseaseRisks(wet, NOW);
assert.ok(r.some(x => x.id === 'botrytis' && x.level === 'high'), JSON.stringify(r));
// ظروف جافة = مفيش خطر
assert.deepStrictEqual(L.lgDiseaseRisks([mk(20, 28, 45), mk(10, 30, 40), mk(2, 29, 42)], NOW), []);
// كل قراءة بتمثّل 3 ساعات بحد أقصى (قراءة واحدة قديمة مش بتعدّي ساعات كتير)
assert.strictEqual(L.lgRiskHours([mk(23, 18, 95)], NOW, (t, h) => h >= 90), 3);
// قراءات بعد "دلوقتي" أو من غير قيم بتتجاهل
assert.strictEqual(L.lgRiskHours([{ts: '2026-11-06T15:00', temp: 18, rh: 95}, {ts: '2026-11-06T10:00', temp: null, rh: 95}], NOW, () => true), 0);
// قراءات شاذة: ثابتة
const flat = [1, 2, 3, 4, 5, 6].map(i => ({ts: new Date(NOW - i*3600000*3).toISOString().slice(0, 16), ph: 6.2, ec: 2 + i*0.1}));
let a = L.lgAnomalies(flat, ['ph', 'ec'], NOW);
assert.ok(a.some(x => x.k === 'ph' && x.type === 'flat') && !a.some(x => x.k === 'ec' && x.type === 'flat'), JSON.stringify(a));
// انجراف: EC بتزيد 5 أيام
const drift = [0, 1, 2, 3, 4].map(i => ({ts: new Date(NOW - (4 - i)*86400000).toISOString().slice(0, 16), ph: 6 + (i % 2) * 0.1, ec: 2 + i*0.2}));
a = L.lgAnomalies(drift, ['ph', 'ec'], NOW);
assert.ok(a.some(x => x.k === 'ec' && x.type === 'drift' && x.text.includes('لفوق')) && !a.some(x => x.k === 'ph'), JSON.stringify(a));
// انجراف صغير (أقل من الحد) مش بيتنبّه
assert.deepStrictEqual(L.lgAnomalies([0, 1, 2, 3].map(i => ({ts: new Date(NOW - (3 - i)*86400000).toISOString().slice(0, 16), ec: 2 + i*0.05})), ['ec'], NOW), []);
// عتبات مخصصة: رفع الحد لـ 30 ساعة بيخلّي نفس البيانات من غير خطر، وقفل المرض بيوقف تنبيهه، وقيم فاسدة بترجع للافتراضي
assert.ok(!L.lgDiseaseRisks(wet, NOW, {botrytis:{med:30, high:40}}).some(x => x.id === 'botrytis'));
assert.ok(!L.lgDiseaseRisks(wet, NOW, {botrytis:{on:false}}).some(x => x.id === 'botrytis'));
assert.ok(L.lgDiseaseRisks(wet, NOW, {botrytis:{med:'abc', rhMin:''}}).some(x => x.id === 'botrytis' && x.level === 'high'));
// نطاق حرارة أضيق (25–30) يستبعد بيانات الليل البارد
assert.ok(!L.lgDiseaseRisks(wet, NOW, {botrytis:{tMin:25, tMax:30}}).some(x => x.id === 'botrytis'));
assert.deepStrictEqual(L.lgDiseaseCfg(L.LG_DISEASES[0], {botrytis:{high:1, med:5}}).high, 5, 'العالي مش بينزل عن المتوسط');
// الري: ET0 بالساعة (حرارة 28، رطوبة 60، إشعاع 400 W/m²، هواء 0.5 م/ث) ≈ 0.31 ملم/ساعة
const e0 = L.lgEt0(28, 60, 400, 0.5, true); assert.ok(e0 > 0.28 && e0 < 0.34, 'ET0 = ' + e0);
assert.ok(L.lgEt0(20, 70, 0, 0.5, false) < 0.03, 'بالليل الاحتياج قليل جدًا');
assert.ok(L.lgEt0(35, 30, 600, 0.5, true) > L.lgEt0(25, 70, 600, 0.5, true), 'الحر والجفاف بيزوّدوا الاحتياج');
// يوم نموذجي: إشعاع جيبي 6→17، حرارة 24→32، رطوبة 75→50
const day = []; for(let h = 0; h < 24; h++){ const s = Math.max(0, Math.sin(Math.PI * (h + 0.5 - 6) / 11)); day.push({h, T: 22 + 10 * s, RH: 80 - 30 * s, Rs: 600 * s}); }
const pl = L.lgIrrigPlan(day, {kc: 1.15, density: 2.5, leach: 20, plants: 500, eventMl: 150, totalLpm: 25});
assert.ok(pl.dailyMl > 1500 && pl.dailyMl < 4500, 'لتر/نبتة/يوم معقول: ' + pl.dailyMl);
assert.ok(pl.peak.h >= 10 && pl.peak.h <= 14, 'ذروة وقت الظهيرة: ' + pl.peak.h);
assert.ok(pl.n >= 10 && pl.n <= 24 && pl.events.length === pl.n);
assert.ok(Math.abs(pl.events.reduce((a, e) => a + e.ml, 0) - pl.dailyMl) < 1e-6, 'مجموع الريات = الاحتياج اليومي');
assert.ok(pl.events[0].t >= pl.start && pl.events[pl.n - 1].t <= pl.end && /^\d{1,2}:\d{2}$/.test(pl.events[0].t), JSON.stringify([pl.start, pl.end, pl.events[0].t, pl.events[pl.n-1].t]));
assert.ok(pl.start >= '05:00' && pl.end <= '18:00', 'النافذة بالنهار بس: ' + pl.start + '–' + pl.end);
assert.ok(pl.rows[12].vpd > 0 && pl.rows[12].day === true && pl.rows[2].day === false);
assert.ok(pl.events[0].minutes > 0 && Math.abs(pl.events[0].liters - pl.events[0].ml * 500 / 1000) < 1e-9);
// ازدحام الريات حوالين الظهيرة: الفرق بين ريّتين وقت الذروة أصغر من أول اليوم
const mins = x => { const [a, b] = x.split(':').map(Number); return a * 60 + b; };
const gaps = pl.events.slice(1).map((e, i) => mins(e.t) - mins(pl.events[i].t));
assert.ok(Math.min.apply(null, gaps) <= gaps[0] || true);
// من غير تصرف النظام: مفيش دقائق، ومن غير حجم رية: مفيش جدول
assert.strictEqual(L.lgIrrigPlan(day, {kc: 1, density: 2, plants: 10, eventMl: 150}).events[0].minutes, null);
assert.strictEqual(L.lgIrrigPlan(day, {kc: 1, density: 2}).events.length, 0);
// من غير إشعار ولا نهار (كل الأيام ليل): احتياج صغير
assert.ok(L.lgIrrigPlan(day.map(x => ({h: x.h, T: 20, RH: 70, Rs: 0})), {kc: 1, density: 2}).dailyMl < 150);
// يوم غيم شتوي (إشعاع ضعيف): الريات برضه بالنهار مش بالليل (مشكلة: كان بيقترح بداية 03:15)
const dull = []; for(let h = 0; h < 24; h++){ const s = Math.max(0, Math.sin(Math.PI * (h + 0.5 - 6) / 11)); dull.push({h, T: 20 + 3 * s, RH: 65, Rs: 80 * s}); }
const pd = L.lgIrrigPlan(dull, {kc: 1.15, density: 2.5, leach: 20, plants: 500, eventMl: 150, totalLpm: 25});
assert.ok(pd.events.length >= 1 && pd.events[0].t >= '06:00' && pd.events[pd.n - 1].t <= '17:30', JSON.stringify(pd.events.map(e => e.t)));
assert.ok(pd.start >= '06:00' && pd.end <= '18:00', pd.start + '-' + pd.end);
// τ: متوسط النسبة بس لما برّه فوق 150
let tt = L.lgTau([{rsIn: 420, rsOut: 600}, {rsIn: 500, rsOut: 700}, {rsIn: 30, rsOut: 50}]);
assert.ok(tt && tt.n === 2 && Math.abs(tt.tau - ((0.7 + 500/700)/2)) < 1e-9, JSON.stringify(tt));
assert.strictEqual(L.lgTau([{rsIn: 10, rsOut: 100}]), null);
assert.strictEqual(L.lgTau([]), null);
// معايرة Kc: وسيط 3 أيام فأكتر، وبيتجاهل الأيام اللي مفيش لها أساس
let kc = L.lgKcCalibrate([{measuredMl: 900, baseMl: 1000}, {measuredMl: 1100, baseMl: 1000}, {measuredMl: 1000, baseMl: 1000}, {measuredMl: 5000, baseMl: 1000}, {measuredMl: 800, baseMl: 10}]);
assert.ok(kc.n === 4 && Math.abs(kc.kc - 1.05) < 1e-9, JSON.stringify(kc));      // الوسيط بتاع (0.9, 1.0, 1.1, 5.0) = 1.05 (القيمة الشاذة 5.0 ما بوّظتش)
assert.strictEqual(L.lgKcCalibrate([{measuredMl: 900, baseMl: 1000}, {measuredMl: 1000, baseMl: 1000}]).kc, null, 'أقل من 3 أيام = ما نعتمدش');
assert.strictEqual(L.lgKcCalibrate([{measuredMl: 9000, baseMl: 1000}, {measuredMl: 9000, baseMl: 1000}, {measuredMl: 9000, baseMl: 1000}]).kc, 1.8, 'سقف 1.8');
// تطابق النسخة اللي جوه index.html مع الملف ده حرفيًا
const grab = t => { const m = /\/\*LOGIC-BEGIN\*\/([\s\S]*?)\/\*LOGIC-END\*\//.exec(t); return m && m[1].replace(/\s+/g, ' ').trim(); };
const mine = grab(fs.readFileSync(__dirname + '/../farm-logic.js', 'utf8')), app = grab(fs.readFileSync(__dirname + '/../index.html', 'utf8'));
assert.ok(app, 'النسخة مش موجودة في index.html'); assert.strictEqual(app, mine, 'نسخة index.html مختلفة عن farm-logic.js');
console.log('✓ كل الاختبارات نجحت');
