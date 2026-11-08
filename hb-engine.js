/* hb-engine.js — محرك حساب المعادلات السمادية، منقول بنفس خوارزمية المرجع 1.98
   (hb_main.pas: Button2Click). الجزء بين HB-BEGIN و HB-END بيتنسخ حرفيًا جوه index.html
   واختبار tests/hb-engine.test.js بيتأكد إن النسختين متطابقتين وإن الأرقام = مخرجات المرجع الأصلية. */
/*HB-BEGIN*/
var HB_EL = [
  {k:'N_NO3', n:'N (NO3-)', mw:14.007, eq:1, zi:1, lmc:71.46, emp:0.403791},
  {k:'N_NH4', n:'N (NH4+)', mw:14.007, eq:1, zi:1, lmc:73.5, emp:-0.308967},
  {k:'P',  n:'P',  mw:30.974, eq:3, zi:1, lmc:57, emp:0.142525},
  {k:'K',  n:'K',  mw:39.098, eq:1, zi:1, lmc:73, emp:-0.110791},
  {k:'Mg', n:'Mg', mw:24.305, eq:2, zi:2, lmc:106, emp:-0.358782},
  {k:'Ca', n:'Ca', mw:40.078, eq:2, zi:2, lmc:119, emp:-0.283549},
  {k:'S',  n:'S',  mw:32.066, eq:2, zi:2, lmc:160, emp:0.276118},
  {k:'Fe', n:'Fe', mw:55.845, eq:2, zi:2, lmc:108, emp:0},
  {k:'Mn', n:'Mn', mw:54.938, eq:2, zi:2, lmc:0, emp:0},
  {k:'Zn', n:'Zn', mw:65.409, eq:2, zi:2, lmc:0, emp:0},
  {k:'B',  n:'B',  mw:10.811, eq:1, zi:1, lmc:0, emp:0},
  {k:'Cu', n:'Cu', mw:63.546, eq:2, zi:2, lmc:0, emp:0},
  {k:'Si', n:'Si', mw:28.086, eq:2, zi:2, lmc:0, emp:0},
  {k:'Mo', n:'Mo', mw:95.94,  eq:2, zi:2, lmc:76.35, emp:0},
  {k:'Na', n:'Na', mw:22.990, eq:1, zi:1, lmc:50.01, emp:0},
  {k:'Cl', n:'Cl', mw:35.453, eq:1, zi:1, lmc:0, emp:0}
];
var HB_SIO2 = 0.4684, HB_P2O5 = 2.2915, HB_K2O = 1.2047, HB_P2O5_MIX = 2.290;
/* تقريب زي round() بتاع المرجع (Pascal بدقة extended): الأنصاف بتتقرّب لفوق، مع تعويض خطأ الـ double الصغير */
function hbRound(v, p){
  var t = Math.pow(10, p), x = Math.abs(v * t);
  return (v < 0 ? -1 : 1) * Math.round(x * (1 + 1e-12)) / t + 0;
}
/* معامل تحويل ppm ← الوحدة المختارة (ppm | M | mM | mN) لعنصر رقم i */
function hbUnitFactor(unit, i){
  var e = HB_EL[i];
  if(unit === 'M') return 1000 * e.mw;
  if(unit === 'mM') return e.mw;
  if(unit === 'mN') return e.mw / e.eq;
  return 1;
}
/* أقل-معيار least squares بالـ SVD (نفس RMatrixSolveLS في ALGLIB بحد ١٠٠٠·eps):
   A (m×n) ، b (m) ← x (n). One-sided Jacobi على Aᵀ. */
function hbLeastSquares(A, b){
  var m = A.length, n = m ? A[0].length : 0, x = [], i, j, p, q, k;
  for(i=0;i<n;i++) x.push(0);
  if(!m || !n) return x;
  var cols = A.map(function(r){ return r.slice(); });
  var V = []; for(j=0;j<m;j++){ var e = []; for(k=0;k<m;k++) e.push(j===k?1:0); V.push(e); }
  for(var sweep=0; sweep<100; sweep++){
    var rotated = false;
    for(p=0;p<m-1;p++) for(q=p+1;q<m;q++){
      var a=0, bb=0, g=0, cp=cols[p], cq=cols[q];
      for(i=0;i<n;i++){ a += cp[i]*cp[i]; bb += cq[i]*cq[i]; g += cp[i]*cq[i]; }
      if(a === 0 || bb === 0 || Math.abs(g) <= 1e-15 * Math.sqrt(a*bb)) continue;
      rotated = true;
      var zeta = (bb - a) / (2*g), t = (zeta >= 0 ? 1 : -1) / (Math.abs(zeta) + Math.sqrt(1 + zeta*zeta));
      var c = 1 / Math.sqrt(1 + t*t), s = c * t;
      for(i=0;i<n;i++){ var u = cp[i], w = cq[i]; cp[i] = c*u - s*w; cq[i] = s*u + c*w; }
      var vp = V[p], vq = V[q];
      for(k=0;k<m;k++){ var u2 = vp[k], w2 = vq[k]; vp[k] = c*u2 - s*w2; vq[k] = s*u2 + c*w2; }
    }
    if(!rotated) break;
  }
  var sv = cols.map(function(cl){ var s2 = 0; for(var ii=0;ii<n;ii++) s2 += cl[ii]*cl[ii]; return Math.sqrt(s2); });
  var smax = 0; sv.forEach(function(s){ if(s > smax) smax = s; });
  var thr = 1000 * 2.220446049250313e-16 * smax;
  for(j=0;j<m;j++){
    if(!(sv[j] > thr)) continue;
    var proj = 0; for(k=0;k<m;k++) proj += V[j][k] * b[k];
    var f = proj / (sv[j]*sv[j]);
    for(i=0;i<n;i++) x[i] += f * cols[j][i];
  }
  return x;
}
/* الحساب الكامل.
   in: {
     subs:[{name, formula, comp:{key:%}, purity(0-1), liquid, cost(لكل ١٠٠٠ وحدة), conc:'A'|'B'|'C'|'0'|'', amount(وزن الستوك الحالي), fixed(وزن مثبّت)}],
     solve:true|false, targets:{key:ppm}, water:{key:ppm}, volumeL, factor(معامل التركيز ≥١), ab:true|false,
     dof:'S'|…, siMode:'Si'|'SiO2', ec:'lmc'|'emp', weightErr:0.01, volumeErr:0.1 }
   out: {error?, warnings[], amounts[], cost[], totalCost, ppm[16] (نهائي بعد الماء)، net[16] (من الأسمدة بس)، ge[16], ie[16],
         ec, ratios[], perSub[], stock:{A[],B[]}|null, mix:{pct[16],solids}|null, used[] } */
function hbCompute(inp){
  var subs = inp.subs || [], n = subs.length, i, j;
  var out = {warnings:[], amounts:[], cost:[], used:[], perSub:[], ratios:[], stock:null, mix:null, ppm:[], net:[], ge:[], ie:[]};
  var V = (inp.volumeL > 0 ? inp.volumeL : 1) / 1000;           // م³
  var ab = !!inp.ab, factor = ab ? (inp.factor > 0 ? inp.factor : 1) : 1;
  var siSio2 = inp.siMode === 'SiO2';
  var water = [], target = [], contrib = [];
  for(j=0;j<16;j++){
    var key = HB_EL[j].k;
    water.push(+(inp.water && inp.water[key]) || 0);
    var tv = +(inp.targets && inp.targets[key]) || 0;
    target.push(j === 12 && siSio2 ? tv * HB_SIO2 : tv);
    var row = [];
    for(i=0;i<n;i++) row.push(0.01 * (+(subs[i].comp && subs[i].comp[key]) || 0) * (subs[i].purity > 0 ? subs[i].purity : 1) / V);
    contrib.push(row);
  }
  var pre = subs.map(function(s){ return Math.max(0, +(inp.solve ? s.fixed : s.amount) || 0) / factor; });
  var sol = [];
  for(i=0;i<n;i++) sol.push(0);
  if(inp.solve){
    if(ab){
      for(i=0;i<n;i++) if(String(subs[i].conc) === '0'){ out.error = {code:'incompatible', name:subs[i].name}; return out; }
    }
    var dofIdx = -1;
    HB_EL.forEach(function(e, idx){ if(e.n === inp.dof || e.k === inp.dof) dofIdx = idx; });
    var rows = [], rhs = [];
    for(j=0;j<16;j++){
      if(!(target[j] > 0) || j === dofIdx) continue;
      var sum = 0, fixedPpm = 0;
      for(i=0;i<n;i++){ sum += contrib[j][i]; fixedPpm += pre[i] * contrib[j][i]; }
      if(sum === 0){ out.error = {code:'noSource', element:HB_EL[j].n}; return out; }
      rows.push(contrib[j].slice());
      rhs.push(target[j] - water[j] - fixedPpm);
    }
    if(!rows.length){ out.error = {code:'noTargets'}; return out; }
    sol = hbLeastSquares(rows, rhs);
  }
  var net = [], ge = [], ie = [];
  var vErr = (+inp.volumeErr >= 0 ? +inp.volumeErr : 0.1) * 0.001, wErr = +inp.weightErr >= 0 ? +inp.weightErr : 0.01;
  var tot = [];
  for(i=0;i<n;i++) tot.push((sol[i] > 0 ? sol[i] : 0) + pre[i]);
  for(j=0;j<16;j++){
    var test = 0, upper = 0, lower = 0;
    for(i=0;i<n;i++){
      var used = (sol[i] > 0) || pre[i] > 0;
      if(!used) continue;
      test += tot[i] * contrib[j][i];
      upper += (tot[i] + wErr) * contrib[j][i] * V / (V - vErr);
      lower += (tot[i] - wErr) * contrib[j][i] * V / (V + vErr);
    }
    net.push(test);
    if(target[j] !== 0){
      ge.push((test + water[j]) * 100 / target[j] - 100);
      ie.push(((upper - lower) * (100 / target[j])) / (2 * factor));
    } else { ge.push(0); ie.push(0); }
  }
  out.net = net; out.ge = ge; out.ie = ie;
  for(j=0;j<16;j++){
    var v = net[j] + water[j];
    if(j === 12 && siSio2) v = v / HB_SIO2;
    out.ppm.push(hbRound(v, 3));
  }
  /* الكميات والتكلفة */
  var totalCost = 0;
  for(i=0;i<n;i++){
    var amt = tot[i] * factor;
    out.amounts.push(amt);
    out.used.push(tot[i] > 0);
    var c = hbRound(0.001 * tot[i] * (+subs[i].cost || 0) * factor, 1);
    out.cost.push(c); totalCost += c;
    if(inp.solve && !(sol[i] > 0) && !(pre[i] > 0)) out.warnings.push({code:'unused', name:subs[i].name});
  }
  out.totalCost = hbRound(totalCost, 1);
  out.dispAmounts = out.amounts.map(function(a){ return hbRound(a, 3); });
  /* تحذيرات الأخطاء */
  for(j=0;j<16;j++){
    if(ie[j] > 100) out.warnings.push({code:'ie', element:HB_EL[j].n});
    if(ge[j] > 100) out.warnings.push({code:'ge', element:HB_EL[j].n});
  }
  /* EC */
  var R = out.ppm, ec = 0, I = 0;
  if(inp.ec === 'emp'){
    for(j=0;j<16;j++) ec += R[j] * HB_EL[j].emp;
    ec = hbRound(ec + 0.39661671, 3);
  } else {
    for(j=0;j<16;j++) I += HB_EL[j].zi * HB_EL[j].zi * (R[j] / (1000 * HB_EL[j].mw));
    for(j=0;j<16;j++) ec += (R[j] / (1000 * HB_EL[j].mw)) * HB_EL[j].lmc * Math.exp(-0.7025187 * Math.sqrt(I) * Math.pow(HB_EL[j].zi, 1.5));
    ec = hbRound(ec, 3);
  }
  out.ec = ec;
  /* تحليل كل سماد على حدة (ppm) */
  for(i=0;i<n;i++){
    if(!(tot[i] > 0)) continue;
    for(j=0;j<16;j++) if(contrib[j][i] > 0) out.perSub.push({name:subs[i].name, element:HB_EL[j].n, ppm:hbRound(tot[i] * contrib[j][i], 3), sub:i, el:j});
  }
  /* النسب */
  out.ratios = hbRatios(R);
  /* تحليل المحاليل المركّزة A / B */
  if(ab){
    var st = {A:[], B:[]};
    ['A','B'].forEach(function(side){
      for(j=0;j<16;j++){
        var t2 = 0;
        for(i=0;i<n;i++) if(tot[i] > 0 && String(subs[i].conc) === side) t2 += tot[i] * contrib[j][i] * V;
        t2 = t2 * factor * 100 / (V * 1000000);
        var nm = HB_EL[j].n, val;
        if(nm === 'P'){ nm = 'P2O5'; val = hbRound(t2 * HB_P2O5, 3); }
        else if(nm === 'K'){ nm = 'K2O'; val = hbRound(t2 * HB_K2O, 3); }
        else val = hbRound(t2, 5);
        st[side].push({name:nm, v:val});
      }
    });
    out.stock = st;
    ['A','B'].forEach(function(side){
      if(st[side][5].v > 0 && st[side][6].v > 0) out.warnings.push({code:'caSulfate', side:side});
      var s = 0; st[side].forEach(function(r){ s += r.v; });
      if(s > 30) out.warnings.push({code:'tooConc', side:side});
    });
  }
  /* تحليل الخلطة الجافة % (وزن/وزن) — لو كل المواد صلبة */
  var allSolids = subs.every(function(s){ return !s.liquid; }), totW = 0, mixC = [];
  for(j=0;j<16;j++) mixC.push(0);
  for(i=0;i<n;i++){
    var a3 = out.dispAmounts[i]; totW += a3;
    for(j=0;j<16;j++) mixC[j] += a3 * contrib[j][i] * V;
  }
  if(allSolids && totW > 0){
    out.mix = {solids:true, pct:HB_EL.map(function(e, jj){
      var nm = e.n, v = hbRound(100 * mixC[jj] / totW, 3);
      if(nm === 'K') v = hbRound(HB_K2O * 100 * mixC[jj] / totW, 3);
      if(nm === 'P') v = hbRound(HB_P2O5_MIX * 100 * mixC[jj] / totW, 3);
      return {name:nm === 'K' ? 'K2O' : nm === 'P' ? 'P2O5' : nm, v:v};
    })};
  }
  out.sol = sol;
  return out;
}
/* النسب بين العناصر (getratio) — بتتحسب من النتيجة النهائية ppm */
function hbRatios(R){
  function g(name){ for(var j=0;j<16;j++) if(HB_EL[j].n === name) return R[j]; return 0; }
  function ratio(a, b, c, items, nSpecial){
    var names = [a, b, c, ''], special = [-1, -1, -1], i;
    for(i=0;i<3;i++){
      if(names[i] === 'N'){ names[i] = 'N (NO3-)'; names[3] = 'N (NH4+)'; special[0] = i; }
      if(names[i] === 'P2O5'){ names[i] = 'P'; special[1] = i; }
      if(names[i] === 'K2O'){ names[i] = 'K'; special[2] = i; }
    }
    var t = [g(names[0]), g(names[1]), g(names[2]), names[3] ? g(names[3]) : 0];
    if(!(t[0] > 0 && t[1] > 0 && t[2] > 0)) return '';
    if(special[0] !== -1 && names[special[0]] === 'N (NO3-)') t[special[0]] = t[3] + t[special[0]];
    if(special[1] !== -1 && names[special[1]] === 'P') t[special[1]] = t[special[1]] * HB_P2O5;
    if(special[2] !== -1 && names[special[2]] === 'K') t[special[2]] = t[special[2]] * HB_K2O;
    var r1 = hbRound(t[1] / t[0], 2), r2 = hbRound(t[2] / t[0], 2);
    return items === 2 ? '1: ' + r1 : '1: ' + r1 + ': ' + r2;
  }
  return [
    {label:'N: P: K', v:ratio('N', 'P', 'K', 3)},
    {label:'N: P2O5: K2O', v:ratio('N', 'P2O5', 'K2O', 3)},
    {label:'N: K', v:ratio('N', 'K', 'K', 2)},
    {label:'N (NO3-): N (NH4+)', v:ratio('N (NO3-)', 'N (NH4+)', 'K', 2)},
    {label:'Ca: Mg', v:ratio('Ca', 'Mg', 'K', 2)},
    {label:'K: Ca', v:ratio('K', 'Ca', 'Ca', 2)}
  ];
}
/*HB-END*/
if(typeof module !== 'undefined') module.exports = {HB_EL:HB_EL, hbCompute:hbCompute, hbLeastSquares:hbLeastSquares, hbRatios:hbRatios, hbRound:hbRound, hbUnitFactor:hbUnitFactor};
