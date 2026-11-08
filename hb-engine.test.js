/* اختبار محرك HydroBuddy: نفس مدخلات عيّنة HydroBuddy 1.98 (الملفات hb_*.csv الأصلية) ونفس المخرجات */
const assert = require('assert'), fs = require('fs'), path = require('path');
const E = require('../hb-engine.js');
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/hb-sample.json'), 'utf8'));
const targets = {N_NO3:190, N_NH4:0, P:47, K:350, Mg:60, Ca:200, S:60, Fe:2, Mn:0.55, Zn:0.33, B:0.4, Cu:0.05, Si:0, Mo:0.05, Na:0, Cl:0};
const water = {N_NO3:0.5, N_NH4:0.01, P:0.0326, K:1.1, Mg:5.09, Ca:3.56, S:3.4, Fe:0.04, Mn:0.02, Zn:0.02, B:0, Cu:0.01, Si:0.01, Mo:0, Na:11.8, Cl:16.1};
const inp = {subs:fx.subs, solve:true, targets, water, volumeL:60, factor:125, ab:true, dof:'S', siMode:'Si', ec:'lmc', weightErr:0.01, volumeErr:0.1};
const r = E.hbCompute(inp);
assert(!r.error, JSON.stringify(r.error));
const exp = {'Dissolvine Zn15':15.709,'Dissolvine Mn13':31.055,'MKP(Mono Potassium Phosphate)':1271.573,'Yara KRISTA k (Plus)':2701.588,'YaraLia(CALCINIT) Cacium nitrate':8615.789,'IN Blancer':25.654,'Cuper Amin':3,'YaraVita(Rexolin Q32)':245,'Agrowmore':27.582,'YaraTera MAG':1765.716,'Sanhory (Magnesium sulfate)':2657.631,'YaraTera(KRISTA SOP)':3584.994};
fx.subs.forEach((s, i) => { if(exp[s.name] != null) assert(Math.abs(r.dispAmounts[i] - exp[s.name]) < 0.0015 || Math.abs(r.dispAmounts[i] - exp[s.name]) / exp[s.name] < 2e-6, s.name + ' ' + r.dispAmounts[i] + ' vs ' + exp[s.name]); });
const ppm = {N_NO3:190, N_NH4:17.885, P:47, K:350, Mg:60, Ca:200, S:152.151, Fe:2, Mn:0.55, Zn:0.33, B:0.4, Cu:0.05, Si:0.01, Mo:0.002, Na:11.8, Cl:16.1};
E.HB_EL.forEach((e, j) => assert.strictEqual(r.ppm[j], ppm[e.k], e.k + ' ' + r.ppm[j] + ' vs ' + ppm[e.k]));
// الأخطاء GE / IE زي hb_ppm_results.csv
const ge = {S:153.6, B:0.1, Mo:-96.6}, ie = {Zn:0.1, Cu:0.3};
E.HB_EL.forEach((e, j) => {
  assert.strictEqual(E.hbRound(r.ge[j], 1), ge[e.k] || 0, 'GE ' + e.k + ' ' + r.ge[j]);
  assert.strictEqual(E.hbRound(r.ie[j], 1), ie[e.k] || 0, 'IE ' + e.k + ' ' + r.ie[j]);
});
assert.strictEqual(r.ec, 2.446, 'EC ' + r.ec);
assert.strictEqual(r.totalCost, 1381.9, 'cost ' + r.totalCost);
// النسب hb_ratios.csv
const rat = {}; r.ratios.forEach(x => rat[x.label] = x.v);
assert.strictEqual(rat['N: P2O5: K2O'], '1: 0.52: 2.03'); assert.strictEqual(rat['N: K'], '1: 1.68');
assert.strictEqual(rat['N (NO3-): N (NH4+)'], '1: 0.09'); assert.strictEqual(rat['Ca: Mg'], '1: 0.3'); assert.strictEqual(rat['K: Ca'], '1: 0.57');
// تحليل A/B hb_stockanalysis.csv
const stA = {}, stB = {}; r.stock.A.forEach(x => stA[x.name] = x.v); r.stock.B.forEach(x => stB[x.name] = x.v);
const wantA = {'N (NO3-)':1.86101,'N (NH4+)':0.14216,P2O5:0,K2O:0,Mg:0,Ca:2.4555,S:0,Fe:0.0245,Mn:0,Zn:0,B:0,Cu:0,Si:0,Mo:0,Na:0,Cl:0};
const wantB = {'N (NO3-)':0.50774,'N (NH4+)':0.08127,P2O5:1.345,K2O:5.254,Mg:0.68638,Ca:0,S:1.85939,Fe:0,Mn:0.00663,Zn:0.00387,B:0.005,Cu:0.0005,Si:0,Mo:0.00002,Na:0,Cl:0};
// قيمتين (Mn, Zn في B) بتقع بالظبط على نص خانة التقريب (٠٫٠٠٦٦٢٥ / ٠٫٠٠٣٨٧٥) فبيتفرق آخر خانة حسب ضجيج الفاصلة العائمة
Object.keys(wantA).forEach(k => { assert(Math.abs(stA[k] - wantA[k]) < 1.01e-5, 'A ' + k + ' ' + stA[k]); assert(Math.abs(stB[k] - wantB[k]) < 1.01e-5, 'B ' + k + ' ' + stB[k]); });
// تحليل كل سماد hb_persubstance.csv (عيّنة)
const ps = r.perSub.filter(x => x.name === 'YaraLia(CALCINIT) Cacium nitrate' && x.element === 'Ca')[0];
assert.strictEqual(ps.ppm, 196.44);
assert.strictEqual(r.perSub.filter(x => x.name === 'Dissolvine Zn15' && x.element === 'Zn')[0].ppm, 0.31);
// وضع التحليل (أوزان معلومة) بيرجّع نفس النتيجة
const an = E.hbCompute(Object.assign({}, inp, {solve:false, subs:fx.subs.map((s, i) => Object.assign({}, s, {amount:r.amounts[i]}))}));
E.HB_EL.forEach((e, j) => assert.strictEqual(an.ppm[j], r.ppm[j]));
assert.strictEqual(an.ec, 2.446);
// SVD أقل-معيار على نظام ناقص التحديد: A x = b متحقق، وأقل معيار
const x = E.hbLeastSquares([[1, 1, 0], [0, 1, 1]], [2, 2]);
assert(Math.abs(x[0] + x[1] - 2) < 1e-12 && Math.abs(x[1] + x[2] - 2) < 1e-12);
assert(Math.abs(x[0] - 2/3) < 1e-9 && Math.abs(x[1] - 4/3) < 1e-9);
// تطابق النسخة المضمّنة في index.html
const eng = fs.readFileSync(path.join(__dirname, '../hb-engine.js'), 'utf8'), idx = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const blk = s => s.slice(s.indexOf('/*HB-BEGIN*/'), s.indexOf('/*HB-END*/') + 10);
assert.strictEqual(blk(idx), blk(eng), 'نسخة المحرك في index.html مختلفة عن hb-engine.js');
const dat = fs.readFileSync(path.join(__dirname, '../hb-data.js'), 'utf8');
const blk2 = s => s.slice(s.indexOf('/*HBDATA-BEGIN*/'), s.indexOf('/*HBDATA-END*/') + 14);
assert.strictEqual(blk2(idx), blk2(dat), 'بيانات HydroBuddy في index.html مختلفة عن hb-data.js');
console.log('hb-engine OK');
