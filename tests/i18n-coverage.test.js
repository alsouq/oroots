/* تغطية الترجمة: كل نص عربي بيظهر في الواجهة (من الكود نفسه) لازم يكون له ترجمة صريحة في i18n/en.json،
   وكل قالب فيه قيم ({} / #) لازم يرجّع إنجليزي كامل والقيم في مكانها.
   لو الاختبار ده وقع: ضيف الترجمة في i18n/dict.tsv (عربي <TAB> English <TAB> English) وشغّل python3 i18n/build_i18n.py */
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let X;
try{ X = require('../i18n/extract.js'); }catch(e){ console.log('i18n-coverage SKIP (محتاج acorn: npm i -D acorn)'); process.exit(0); }
const E = require('../i18n-engine.js');
const {ignored} = require('../i18n/ignore.js');
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'en.json'), 'utf8'));
const map = X.extract(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const AR = /[؀-ۿ]/;

const missing = [], broken = [];
for(const [k, o] of map){
  const ctx = Object.keys(o.ctx || {}).join(',');
  if(ignored(k, ctx)) continue;
  if(D[k] == null){ missing.push(k + '   [' + ctx + ']'); continue; }
  // القالب: نملا القيم بعلامات ونتأكد إنها رجعت كلها والباقي مفيهوش عربي
  let n = 0;
  const sample = k.replace(/\{\}/g, () => 'Q' + (n++) + 'Z').replace(/#/g, '7');
  const r = E.i18nLookup(D, sample);
  if(r == null || (AR.test(r) && !AR.test(D[k]))){ broken.push(k + '  →  ' + r); continue; }   // ترجمة فيها عربي عن قصد (زي «مثال: Cairo أو القاهرة») مسموحة
  for(let i = 0; i < n; i++) if(r.indexOf('Q' + i + 'Z') < 0){ broken.push(k + '  →  ' + r + '   (قيمة رقم ' + (i + 1) + ' ضاعت)'); break; }
}
if(missing.length) console.log('نصوص من غير ترجمة (' + missing.length + '):\n  ' + missing.slice(0, 300).join('\n  '));
if(broken.length) console.log('قوالب ترجمتها مش سليمة (' + broken.length + '):\n  ' + broken.slice(0, 300).join('\n  '));
assert.strictEqual(missing.length, 0, 'فيه نصوص من غير ترجمة');
assert.strictEqual(broken.length, 0, 'فيه قوالب ترجمتها مش سليمة');

// المحرك: قيمة جوه قالب بتتترجم لو ليها ترجمة، ولو مالهاش بتفضل زي ما هي
const d = {'قطفة # من #': 'Cut # of #', '{} — مواسير {}': '{} — pipes {}', 'خس رومين': 'Romaine lettuce', 'عدّت ميعاد {} بـ # يوم': '{0} overdue by # days', 'الحصاد': 'harvest'};
assert.strictEqual(E.i18nLookup(d, 'خس رومين — مواسير 1–40'), 'Romaine lettuce — pipes 1–40');
assert.strictEqual(E.i18nLookup(d, 'ريحان — مواسير 3'), 'ريحان — pipes 3');
assert.strictEqual(E.i18nLookup(d, 'عدّت ميعاد الحصاد بـ 3 يوم'), 'harvest overdue by 3 days');
assert.strictEqual(E.i18nLookup(d, '✂️ قطفة ٢ من ٥'), '✂️ Cut 2 of 5', 'إيموجي في الأول بيفضل، والأرقام العربي بتتحوّل');
console.log('i18n-coverage OK (' + map.size + ' نص في الكود)');
