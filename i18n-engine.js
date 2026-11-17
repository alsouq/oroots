/* i18n-engine.js — ترجمة واجهة O'Roots (عربي / English).
   الأساس: قاموس "النص العربي ← الترجمة" بيتطبّق على نصوص الصفحة (text nodes + placeholder/title/aria-label) وقت العرض،
   فكل الواجهة بتتترجم من غير ما نغيّر كود كل شاشة.
   - الأرقام في النص بتتحوّل لـ # وبترجع في مكانها (فـ"آخر ٧ أيام" و"آخر 30 يوم" مدخل واحد).
   - القوالب: أي قيمة بتتحسب وقت التشغيل (اسم صنف، تاريخ، اسم نظام...) مكانها {} في المفتاح.
     الترجمة فيها {} بنفس الترتيب، أو {0} {1} لو الترتيب في الإنجليزي مختلف. القيمة نفسها بتتترجم لو ليها ترجمة.
     القوالب بتتطلع أوتوماتيك من الكود (i18n/extract.js) واختبار التغطية بيتأكد إن كلها مترجمة.
   - الإيموجي اللي جوه النص مش جزء من المفتاح (التطبيق بيبدّلها بأيقونات).
   اللي ملهوش ترجمة بيفضل عربي. الجزء بين I18N-BEGIN و I18N-END بيتنسخ حرفيًا جوه index.html (يتأكد منه tests/i18n.test.js). */
/*I18N-BEGIN*/
var I18N_LANGS = {ar:{dir:'rtl', name:'العربية'}, en:{dir:'ltr', name:'English'}};
var I18N_NUM = /[0-9٠-٩]+(?:[.,٫][0-9٠-٩]+)?/g;
var I18N_AR = /[؀-ۿ]/;
var I18N_ARW = /[\u0600-\u06FF]+/g;
/* إيموجي ورموز الأيقونات (مش الأسهم ولا علامات الترقيم) */
var I18N_EMO = /(?:[\u231A-\u23FF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF])+/g;
var I18N_EMO1 = new RegExp(I18N_EMO.source);
var I18N_DIGITS = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','٫':'.'};
function i18nAsciiNum(n){ return String(n).replace(/[٠-٩٫]/g, function(c){ return I18N_DIGITS[c]; }); }
/* المفتاح: النص بعد ما كل رقم يتحوّل لـ # والمسافات تتوحّد */
function i18nKey(core){ return String(core).replace(/\s+/g, ' ').replace(I18N_NUM, '#').replace(/\u066A/g, '%'); }
function i18nNoEmo(s){ return String(s).replace(I18N_EMO, ' ').replace(/\s+/g, ' ').trim(); }
function i18nFill(tr, nums){ var i = 0; return tr.replace(/#/g, function(){ return i < nums.length ? i18nAsciiNum(nums[i++]) : '#'; }); }

/* ---- القوالب: بتتجمّع مرة واحدة من القاموس (أي مفتاح فيه {}) ---- */
function i18nEsc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'); }
function i18nTemplates(dict){
  if(dict['\u0001tc']) return dict['\u0001tc'];
  var byWord = {}, loose = [], n = 0, ARL = /[\u0621-\u064A]/;
  Object.keys(dict).forEach(function(k){
    if(k.charAt(0) === '\u0001' || k.indexOf('{}') < 0 || typeof dict[k] !== 'string') return;
    var parts = k.split(/(\{\}|#)/), re = '', kinds = [], glue = [], fixed = 0, words = [];
    // قيمة في أول أو آخر الجملة ممكن تيجي فاضية: لو فيها أيقونة الصفحة بتقسم الجملة عندها (زي «— زراعة X — ✅ جاهزة»)
    var lastI = parts.length - 1; while(lastI > 0 && parts[lastI] === '') lastI--;
    var firstI = 0; while(firstI < parts.length - 1 && parts[firstI] === '') firstI++;
    parts.forEach(function(p, i){
      if(p === '{}' || p === '#'){
        var sepB = /[—–·:،,(|•]\s*$/.test(parts[i - 1] || ''), sepA = /^\s*[—–·:،,)|•]/.test(parts[i + 1] || '');
        var opt = p === '{}' && parts.length > 3 && ((i === lastI && sepB) || (i === firstI && sepA));
        if(opt && i === lastI) re = re.replace(/\\s\+$/, '\\s*');
        re += p === '{}' ? (opt ? '([\\s\\S]*?)' : '([\\s\\S]+?)') : '([0-9٠-٩]+(?:[.,٫][0-9٠-٩]+)?)'; kinds.push(p === '{}' ? 's' : 'n');
        // القيمة لازقة في حرف عربي ثابت قبلها أو بعدها (زي «ال{}» أو «{}جم»)
        var prev = parts[i - 1] || '', next = parts[i + 1] || '';
        glue.push({b: ARL.test(prev.slice(-1)) ? prev : '', a: ARL.test(next.charAt(0))});
        return;
      }
      if(!p) return;
      var ep = i18nEsc(p).replace(/\uFF03/g, '#');   // ＃ في القالب = علامة # عادية (مش رقم)
      if(i === firstI + 1 && parts[firstI] === '{}' && parts.length > 3 && /^\s*[—–·:،,)|•]/.test(p)) ep = ep.replace(/^\\s\+/, '\\s*');
      re += ep; fixed += p.replace(/\s/g, '').length;
      // كلمات كاملة (مش لازقة في قيمة) تنفع فهرس
      var ws = p.match(/[\u0600-\u06FF]{2,}/g) || [];
      ws.forEach(function(w, j){
        if(j === 0 && i > 0 && p.indexOf(w) === 0) return;
        if(j === ws.length - 1 && i < parts.length - 1 && p.slice(-w.length) === w) return;
        words.push(w);
      });
    });
    if(!fixed) return;
    var t = {k:k, re:new RegExp('^' + re + '$'), kinds:kinds, glue:glue, fixed:fixed};
    if(words.length){ words.sort(function(a, b){ return b.length - a.length; }); (byWord[words[0]] = byWord[words[0]] || []).push(t); }
    else loose.push(t);
    n++;
  });
  var tc = {byWord:byWord, loose:loose, n:n};
  try{ Object.defineProperty(dict, '\u0001tc', {value:tc, enumerable:false, configurable:true}); }catch(e){ dict['\u0001tc'] = tc; }
  return tc;
}
/* القيمة اللازقة في حرف عربي ثابت ما ينفعش تقطع كلمة: «{}جم» ما يطابقش «كجم»، و«ال{}» بس قبل كلمة */
var I18N_PFX = /(^|[\s(«"'\/])(ال|لل|بال|وال|فال|كال|و|ب|ل|ف|ك|بـ|لـ)$/;
function i18nGlueOk(t, m){
  var ARL = /[\u0621-\u064A]/;
  for(var j = 0; j < t.kinds.length; j++){
    var g = t.glue[j], v = m[j + 1];
    if(g.a && ARL.test(v.slice(-1))) return false;
    if(g.b && ARL.test(v.charAt(0)) && !I18N_PFX.test(g.b)) return false;
  }
  return true;
}
/* الترجمة: {} بالترتيب أو {0} {1} حسب الرقم، و # للأرقام بالترتيب */
function i18nApplyTpl(tr, slots, nums){
  var si = 0, ni = 0;
  return tr.replace(/\{(\d*)\}|#/g, function(m, d){
    if(m === '#') return ni < nums.length ? i18nAsciiNum(nums[ni++]) : '#';
    var v = d !== '' ? slots[+d] : slots[si++];
    return v == null ? '' : v;
  }).replace(/\uFF03/g, '#');
}
function i18nTplLookup(dict, core, depth){
  if(depth > 3) return null;
  var tc = i18nTemplates(dict); if(!tc.n) return null;
  var seen = {}, cands = [], w = core.match(I18N_ARW) || [];
  w.forEach(function(x){ if(seen[x]) return; seen[x] = 1; var l = tc.byWord[x]; if(l) cands = cands.concat(l); });
  cands = cands.concat(tc.loose);
  if(!cands.length) return null;
  cands.sort(function(a, b){ return b.fixed - a.fixed; });
  for(var i = 0; i < cands.length; i++){
    var t = cands[i], m = t.re.exec(core);
    if(!m || !i18nGlueOk(t, m)) continue;
    var slots = [], nums = [];
    for(var j = 0; j < t.kinds.length; j++){
      var v = m[j + 1];
      if(t.kinds[j] === 'n'){ nums.push(v); continue; }
      var vt = v;
      if(I18N_AR.test(v)){ var r = i18nLookupCore(dict, v.trim(), depth + 1); if(r != null) vt = v.replace(v.trim(), r); }
      slots.push(vt);
    }
    var out = i18nApplyTpl(dict[t.k], slots, nums);
    if(t.kinds.length && t.kinds[t.kinds.length - 1] === 's' && slots[slots.length - 1] === '') out = out.replace(/\s+$/, '');
    if(t.kinds.length && t.kinds[0] === 's' && slots[0] === '') out = out.replace(/^\s+/, '');
    return out;
  }
  return null;
}

/* dict: {نص عربي: ترجمة}. بيرجّع الترجمة أو null لو مفيش. بيحافظ على المسافات اللي في الأطراف. */
function i18nLookup(dict, text){
  if(!text || !I18N_AR.test(text)) return null;
  var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text), lead = m[1], core = m[2], tail = m[3];
  if(!core) return null;
  var r = i18nLookupCore(dict, core, 0);
  return r == null ? null : lead + i18nOne(r) + tail;
}
/* «1 rows» ← «1 row»: العربي بيستخدم المفرد بعد الأرقام، فالترجمة بتبقى جمع — رقم 1 لوحده بيرجع مفرد */
var I18N_ONE = /(^|[^\d.,])1 (rows|pipes|trays|plants|days|readings|items|orders|tasks|times|sprays|packs|groups|photos|hours|minutes|records|systems|customers|complaints|cuts|weighings|uses|irrigations|alerts|messages|lines|types|ingredients|batches|greenhouses|fertilizers|barcodes|weeks|months|years|actions|accounts|drippers|sessions)\b/g;
function i18nOne(s){ return s.indexOf('1 ') < 0 ? s : s.replace(I18N_ONE, function(m, a, w){ return a + '1 ' + (w === 'batches' ? 'batch' : w.slice(0, -1)); }); }
function i18nLookupCore(dict, core, depth){
  var nums = core.match(I18N_NUM) || [], key = i18nKey(core), tr = dict[key];
  if(tr != null) return i18nFill(tr, nums);
  // إيموجي جوه النص: بندوّر من غيرها (والترجمة من غيرها برضه عشان الأيقونة ما تتكررش)
  if(I18N_EMO1.test(core)){
    var se = /^([^\u0600-\u06FFA-Za-z0-9(«"'#]+)([\s\S]*)$/.exec(core), ee = /^([\s\S]*?[\u0600-\u06FFA-Za-z0-9)»"'%.؟?!:])([^\u0600-\u06FFA-Za-z0-9)»"'%]+)$/.exec(core);
    var pre = se ? se[1] : '', rest = se ? se[2] : core, suf = '';
    if(ee && rest.length > ee[2].length && rest.slice(-ee[2].length) === ee[2]){ suf = ee[2]; rest = rest.slice(0, -suf.length); }
    if(pre || suf){ var rr = i18nLookupCore(dict, rest, depth); if(rr != null) return pre + rr + suf; }
    var c2 = i18nNoEmo(core);
    if(c2 && c2 !== core){ var r2 = i18nLookupCore(dict, c2, depth); if(r2 != null) return r2; }
    return null;
  }
  if(tr == null){
    // علامة ترقيم في الآخر (: ؟ ! .) بنتجاهلها ونرجّعها
    var pm = /^([\s\S]*?)([:؟!.…،]+)$/.exec(key);
    if(pm && dict[pm[1]] != null){ return i18nFill(dict[pm[1]] + pm[2].replace('؟', '?').replace('،', ','), nums); }
  }
  // قالب من الكود: الأجزاء الثابتة معروفة والقيم بتتحسب وقت التشغيل
  var tp = i18nTplLookup(dict, core, depth);
  if(tp != null) return tp;
  if(tr == null){
    // عنوان: قيمة — بنترجم كل واحد لوحده (القيمة كلها مرة واحدة، فتقدر تكون قايمة فيها فواصل)
    var lv = /^([^:]{1,40}):\s([\s\S]+)$/.exec(key);
    if(lv){
      var tx = function(x){ return !I18N_AR.test(x) ? x : (dict[x] != null ? dict[x] : i18nLookupCore(dict, x, depth + 1)); };   // الجزء اللي مفيهوش عربي (زي LG1 — S1) بيفضل زي ما هو
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
        if(t2 == null && pt && depth < 4){ t2 = i18nLookupCore(dict, pt, depth + 1); if(t2 != null) t2 = t2.trim(); }   // كل جزء ممكن يتترجم بالقواعد التانية كمان
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
    // آخر حل (للبيانات اللي الفريق بيكتبها): عبارات/كلمات معروفة — أطول عبارة (لحد ٦ كلمات) ليها ترجمة، وإلا الكلمة لوحدها من قاموس الكلمات. لازم كل الكلمات العربية تتغطّى.
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
          if(hit != null && typeof hit === 'string' && hit.indexOf('{') < 0){
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
    // رموز في الأول أو الآخر (• ← ...): بنترجم النص اللي جواها ونرجّعها
    var sm = /^([^\u0600-\u06FFA-Za-z0-9(«"']+)([\s\S]*)$/.exec(core);
    if(sm && sm[2]){ var r1 = i18nLookupCore(dict, sm[2], depth); if(r1 != null) return sm[1] + r1; }
    var em = /^([\s\S]*[\u0600-\u06FF])([^\u0600-\u06FFA-Za-z0-9)»"']+)$/.exec(core);
    if(em){ var r3 = i18nLookupCore(dict, em[1], depth); if(r3 != null) return r3 + em[2]; }
    return null;
  }
  return i18nFill(tr, nums);
}
/*I18N-END*/
if(typeof module !== 'undefined') module.exports = {I18N_LANGS:I18N_LANGS, i18nKey:i18nKey, i18nFill:i18nFill, i18nLookup:i18nLookup, i18nAsciiNum:i18nAsciiNum, i18nNoEmo:i18nNoEmo, i18nTemplates:i18nTemplates};
