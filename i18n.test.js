/* اختبار الترجمة: المحرك + قاموس اللغات (تطابق الأرقام # بين العربي والترجمة، وتماثل الإنجليزي/الألماني) + تطابق نسخة index.html */
const assert = require('assert'), fs = require('fs'), path = require('path');
const E = require('../i18n-engine.js');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const blk = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b) + b.length);
assert.strictEqual(blk(html, '/*I18N-BEGIN*/', '/*I18N-END*/'), blk(fs.readFileSync(path.join(__dirname, '../i18n-engine.js'), 'utf8'), '/*I18N-BEGIN*/', '/*I18N-END*/'), 'محرك الترجمة في index.html مختلف عن i18n-engine.js');
const D = {en: JSON.parse(fs.readFileSync(path.join(__dirname, '../i18n/en.json'), 'utf8'))};
assert(/var I18N_VER = "[0-9a-f-]+";/.test(html), 'رقم نسخة القاموس مش موجود في index.html');
assert(!/var I18N_DICT = \{"/.test(html), 'القاموس لسه جوه index.html (المفروض ملف منفصل)');
// الأرقام والترجمة
const NUM = /[0-9٠-٩]+(?:[.,٫][0-9٠-٩]+)?/g;
['en'].forEach(l => {
  const d = D[l]; let n = 0;
  Object.keys(d).forEach(k => {
    if(k === '\u0001p'){ d[k].forEach(([pk, tr]) => { assert.strictEqual((pk.match(/#/g) || []).length, (tr.match(/#/g) || []).length, l + ' prefix ' + pk); }); return; }
    if(k === '\u0001w') return;
    n++; assert.strictEqual((k.match(/#/g) || []).length, (d[k].match(/#/g) || []).length, l + ' # mismatch: ' + k.slice(0, 40));
    assert(d[k].length, l + ' empty: ' + k);
  });
  assert(n > 1000, l + ' dictionary too small: ' + n);
});
const keys = l => Object.keys(D[l]).filter(k => k.charCodeAt(0) > 1).sort();
// البحث
const L = (l, t) => E.i18nLookup(D[l], t);
assert.strictEqual(L('en', 'حذف'), 'Delete');
assert.strictEqual(L('en', '24 ساعة'), '24 hours'); assert.strictEqual(L('en', '٣ شهور'), '3 months');
assert.strictEqual(L('en', '  آخر 30 يوم '), '  Last 30 days ');
assert.strictEqual(L('en', '60 من 60 قراءة يومية مطلوبة'), '60 of 60 daily readings required');
assert.strictEqual(L('en', 'حذف:'), 'Delete:');                                // علامة ترقيم في الآخر
assert.strictEqual(L('en', 'تحذف حساب a@b.com؟'), 'Delete account a@b.com?');   // بداية جملة + اسم
assert.strictEqual(L('en', '(خزان B) K 40% · S 18% — سعر 12/كجم'), '(Tank B) K 40% · S 18% — price 12/kg');   // كلمات
assert.strictEqual(L('en', 'نص مش في القاموس xyz'), null);
assert.strictEqual(L('en', 'LG1 — S1'), null);                                   // مفيش عربي: ما بيتلمسش
console.log('i18n OK (en ' + keys('en').length + ' entries)');
