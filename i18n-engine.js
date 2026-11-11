/* i18n-engine.js — ترجمة واجهة O'Roots (عربي / English / Deutsch).
   الأساس: قاموس "النص العربي ← الترجمة" بيتطبّق على نصوص الصفحة (text nodes + placeholder/title/aria-label) وقت العرض،
   فكل الواجهة بتتترجم من غير ما نغيّر كود كل شاشة. الأرقام في النص بتتحوّل لـ # وبترجع في مكانها (فـ"آخر ٧ أيام" و"آخر 30 يوم" مدخل واحد).
   اللي ملهوش ترجمة بيفضل عربي. الجزء بين I18N-BEGIN و I18N-END بيتنسخ حرفيًا جوه index.html (يتأكد منه tests/i18n.test.js). */
/*I18N-BEGIN*/
var I18N_LANGS = {ar:{dir:'rtl', name:'العربية'}, en:{dir:'ltr', name:'English'}};
var I18N_NUM = /[0-9٠-٩]+(?:[.,٫][0-9٠-٩]+)?/g;
var I18N_AR = /[؀-ۿ]/;
var I18N_DIGITS = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','٫':'.'};
function i18nAsciiNum(n){ return String(n).replace(/[٠-٩٫]/g, function(c){ return I18N_DIGITS[c]; }); }
/* المفتاح: النص بعد ما كل رقم يتحوّل لـ # */
function i18nKey(core){ return core.replace(I18N_NUM, '#').replace(/\u066A/g, '%'); }
function i18nFill(tr, nums){ var i = 0; return tr.replace(/#/g, function(){ return i < nums.length ? i18nAsciiNum(nums[i++]) : '#'; }); }
/* dict: {نص عربي: ترجمة}. بيرجّع الترجمة أو null لو مفيش. بيحافظ على المسافات اللي في الأطراف. */
function i18nLookup(dict, text){
  if(!text || !I18N_AR.test(text)) return null;
  var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text), lead = m[1], core = m[2], tail = m[3];
  if(!core) return null;
  var nums = core.match(I18N_NUM) || [], key = i18nKey(core), tr = dict[key];
  if(tr == null){
    // علامة ترقيم في الآخر (: ؟ ! .) بنتجاهلها ونرجّعها
    var pm = /^([\s\S]*?)([:؟!.…،]+)$/.exec(key);
    if(pm && dict[pm[1]] != null){ tr = dict[pm[1]] + pm[2].replace('؟', '?').replace('،', ','); }
  }
  if(tr == null){
    // عنوان: قيمة — بنترجم كل واحد لوحده (القيمة كلها مرة واحدة، فتقدر تكون قايمة فيها فواصل)
    var lv = /^([^:]{1,40}):\s([\s\S]+)$/.exec(key);
    if(lv){
      var tx = function(x){ return !I18N_AR.test(x) ? x : (dict[x] != null ? dict[x] : i18nLookup(dict, x)); };   // الجزء اللي مفيهوش عربي (زي LG1 — S1) بيفضل زي ما هو
      var l1 = tx(lv[1]), v1 = tx(lv[2]);
      if(l1 != null && v1 != null) tr = String(l1).trim().replace(/:$/, '') + ': ' + String(v1).trim();
    }
  }
  if(tr == null){
    // نص مركّب (a — b · c): بنترجم كل جزء لوحده لو كله له ترجمة
    var parts = key.split(/(\s[—·|•\/]\s|،\s|:\s)/);
    if(parts.length > 1){
      var ok = true, out = parts.map(function(p, i){
        if(i % 2) return p.replace('،', ',');
        if(!I18N_AR.test(p)) return p;
        var pt = p.trim(), t2 = dict[pt];
        if(t2 == null && pt){ t2 = i18nLookup(dict, pt); if(t2 != null) t2 = t2.trim(); }   // كل جزء ممكن يتترجم بالقواعد التانية كمان
        if(t2 == null){ ok = false; return p; }
        return p.replace(p.trim(), t2);
      });
      if(ok) tr = out.join('');
    }
  }
  if(tr == null){
    // بداية جملة معروفة + باقيها ديناميكي (رسائل زي: تحذف حساب <اسم>؟)
    var P = dict['\u0001p'];
    if(P){ for(var q = 0; q < P.length; q++){ if(key.indexOf(P[q][0]) === 0){ tr = P[q][1] + key.slice(P[q][0].length).replace(/\u061F/g, '?').replace(/\u060C/g, ','); break; } } }
  }
  if(tr == null){
    // تركيب من عبارات/كلمات: أطول عبارة (لحد ٦ كلمات) ليها ترجمة، وإلا الكلمة لوحدها من قاموس الكلمات. لازم كل الكلمات العربية تتغطّى.
    var W = dict['\u0001w'] || {};
    var seg = key.split(/([\u0600-\u06FF]+)/), idx = [], z, y;
    for(z = 1; z < seg.length; z += 2) idx.push(z);
    if(idx.length){
      var ok2 = true, res = seg.slice(), pos = 0;
      while(pos < idx.length){
        var found = false;
        for(var L = Math.min(6, idx.length - pos); L >= 1 && !found; L--){
          var okSep = true, ph = seg[idx[pos]];
          for(y = 1; y < L; y++){ if(seg[idx[pos + y] - 1] !== ' '){ okSep = false; break; } ph += ' ' + seg[idx[pos + y]]; }
          if(!okSep) continue;
          var hit = dict[ph];
          if(hit == null && L === 1) hit = W[ph];
          if(hit != null && typeof hit === 'string'){
            res[idx[pos]] = hit;
            for(y = 1; y < L; y++){ res[idx[pos + y]] = ''; res[idx[pos + y] - 1] = ''; }
            pos += L; found = true;
          }
        }
        if(!found){ ok2 = false; break; }
      }
      if(ok2) tr = res.join('').replace(/\u061F/g, '?').replace(/\u060C/g, ',');
    }
  }
  if(tr == null){
    // رموز/إيموجي في الأول أو الآخر (🏷 ⏱️ ...): بنترجم النص اللي جواها ونرجّعها
    var sm = /^([^\u0600-\u06FFA-Za-z0-9(«"']+)([\s\S]*)$/.exec(core);
    if(sm && sm[2]){ var r1 = i18nLookup(dict, sm[2]); if(r1 != null) return lead + sm[1] + r1 + tail; }
    var em = /^([\s\S]*[\u0600-\u06FF])([^\u0600-\u06FFA-Za-z0-9)»"']+)$/.exec(core);
    if(em){ var r2 = i18nLookup(dict, em[1]); if(r2 != null) return lead + r2 + em[2] + tail; }
    return null;
  }
  return lead + i18nFill(tr, nums) + tail;
}
/*I18N-END*/
if(typeof module !== 'undefined') module.exports = {I18N_LANGS:I18N_LANGS, i18nKey:i18nKey, i18nFill:i18nFill, i18nLookup:i18nLookup, i18nAsciiNum:i18nAsciiNum};
