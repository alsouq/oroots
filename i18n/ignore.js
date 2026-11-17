/* O'Roots — نصوص عربي في الكود بس مش بتظهر في الواجهة (فمش محتاجة ترجمة):
   كلمات الإدخال بالصوت، كلمات البحث عن الآفات، أسماء المواد الفعالة بكل كتاباتها، تعبيرات البحث (RegExp).
   اختبار التغطية (tests/i18n-coverage.test.js) بيتخطّاها. */
'use strict';
/* سياقات (اسم المتغيّر/الدالة اللي النص جواه) كلها بيانات مطابقة */
const CTX = /^(V_[A-Z_]+|voiceParseTask|vAr|invNorm|pipeCropKind|I18N_DIGITS)$|\.kw$|\.re$/;
/* نصوص بعينها: حروف/كلمات لوحدها بتستخدم في فهم الكلام أو مقارنة قيم */
const EXACT = new Set([
  '،', '؟', 'ا', 'ال', 'د', 'دي', 'بي', 'جي', 'اتش', 'ايل', 'اي', 'جي إن ك'
]);
function ignored(key, ctxList){
  if(EXACT.has(key)) return true;
  if(/\|/.test(key) && !/\s\|\s/.test(key)) return true;                 // أسماء بديلة: ابامكتين|abamectin|...
  if(/\(\?:|\[#|\\[sdbw]|\(\^/.test(key)) return true;                      // تعبير بحث
  const ctx = (ctxList || '').split(',').filter(Boolean);
  return ctx.length > 0 && ctx.every(c => CTX.test(c));
}
module.exports = {ignored};
