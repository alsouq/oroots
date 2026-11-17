/* O'Roots — استخراج كل نصوص الواجهة العربي من index.html (للترجمة واختبار التغطية).
   كل نص بيطلع «قالب»: الأجزاء الثابتة زي ما هي، وأي قيمة بتتحسب وقت التشغيل مكانها {} (والأرقام #).
     node i18n/extract.js                 → i18n/strings.json (القوالب + عدد مرات الظهور)
   بيشتغل على: كود الجافاسكربت (السلاسل المتجمّعة بـ +) + الـ HTML الثابت + خصائص placeholder/title/aria-label/alt */
'use strict';
const fs = require('fs'), path = require('path');
let acorn;
try{ acorn = require('acorn'); }catch(e){ acorn = require(process.env.ACORN || '/tmp/claude-0/lint/node_modules/acorn'); }

const AR = /[؀-ۿ]/;
const NUM = /[0-9٠-٩]+(?:[.,٫][0-9٠-٩]+)?/g;
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

/* نفس تطبيع المفتاح بتاع المحرك: مسافات + أرقام → # + ٪ → % */
const E = require('../i18n-engine.js');
const EMO = /(?:[\u231A-\u23FF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF])+/, EMO1 = EMO;
/* نفس تطبيع المحرك: مسافات + أرقام → # + ٪ → % + من غير إيموجي (التطبيق بيبدّلها بأيقونات) */
function norm(s){ s = String(s); if(s.indexOf('{}') >= 0) s = s.replace(/#/g, '\uFF03');   // في القوالب: علامة # عادية = ＃ (عشان # معناها رقم)
  return E.i18nNoEmo(s.replace(/\s+/g, ' ').trim().replace(NUM, '#').replace(/٪/g, '%')).replace(/(\{\}){2,}/g, '{}'); }   // قيمتين لازقين = قيمة واحدة
function decodeEnt(s){ return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&times;/g, '×').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)); }

function scriptOf(html){
  const re = /<script>([\s\S]*?)<\/script>/g; let m, best = '';
  while((m = re.exec(html))) if(m[1].length > best.length) best = m[1];
  return best;
}
/* الـ HTML الثابت (برّه السكربت): النصوص بين التاجات + الخصائص */
function fromMarkup(html, add){
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  body.replace(/>([^<]+)</g, (m, t) => { t = decodeEnt(t); if(AR.test(t)) add(norm(t), 'html'); return m; });
  body.replace(/<[^>]+>/g, tag => { attrsIn(tag).forEach(v => add(norm(v), 'attr')); return tag; });
}
function attrsIn(tag){
  const out = []; let m;
  const re = /\b(placeholder|title|aria-label|alt)="([^"]*)"/g;
  while((m = re.exec(tag))) if(AR.test(m[2]) && m[2].indexOf('{}') < 0) out.push(decodeEnt(m[2]));
  return out;
}

/* بيحوّل سلسلة a + b + c لقايمة: نص ثابت أو {} (قيمة بتتحسب) */
function flatten(node, out){
  if(node.type === 'BinaryExpression' && node.operator === '+'){ flatten(node.left, out); flatten(node.right, out); return out; }
  if(node.type === 'Literal' && typeof node.value === 'string'){ out.push({t: node.value}); return out; }
  if(node.type === 'TemplateLiteral'){
    node.quasis.forEach((q, i) => { out.push({t: q.value.cooked}); if(i < node.expressions.length) out.push({slot: true}); });
    return out;
  }
  out.push({slot: true});
  return out;
}
/* السلسلة بتتقسم على التاجات: كل جزء بين تاجين = نص واحد في الصفحة (text node) */
function runsOf(seq, add, kind){
  let run = [], inTag = false, tagBuf = '';
  const flush = () => {
    if(!run.length) return;
    let s = '', lit = '';
    run.forEach(p => { if(p.slot){ s += '{}'; } else { s += p.t; lit += p.t; } });
    run = [];
    if(!AR.test(lit)) return;
    s = decodeEnt(s);
    // {} في الأطراف مع مسافات بس ⇒ نسيبه (النص بيبدأ أو بينتهي بقيمة)
    const k = norm(s);
    if(k && k !== '{}') add(k, kind);
    // إيموجي في نص الجملة: التطبيق بيبدّلها بأيقونة فالجملة بتتقسم لجزئين في الصفحة — كل جزء محتاج ترجمة لوحده كمان
    const inner = s.replace(/\s+/g, ' ').trim().replace(/^[^؀-ۿA-Za-z0-9{(«"'#]+/, '').replace(/[^؀-ۿA-Za-z0-9})»"'%.؟?!:]+$/, '');
    if(EMO1.test(inner)) inner.split(EMO).forEach(part => {
      const k2 = norm(part).replace(/^[—–\-·•,،:|]\s*|\s*[—–\-·•,،:|]$/g, '').trim();
      if(k2 && k2 !== k && AR.test(k2.replace(/\{\}/g, '')) && k2 !== '{}') add(k2, kind);
    });
  };
  seq.forEach(p => {
    if(p.slot){ if(inTag) tagBuf += '{}'; else run.push(p); return; }
    let t = p.t, i = 0;
    while(i < t.length){
      if(inTag){
        const e = t.indexOf('>', i);
        if(e < 0){ tagBuf += t.slice(i); i = t.length; break; }
        tagBuf += t.slice(i, e + 1); inTag = false; i = e + 1;
        attrsIn(tagBuf).forEach(v => add(norm(v), 'attr')); tagBuf = '';
        continue;
      }
      const lt = t.indexOf('<', i);
      // "<" لوحده من غير اسم تاج (زي "< 5") مش تاج
      if(lt >= 0 && /[A-Za-z\/!]/.test(t.charAt(lt + 1))){
        if(lt > i) run.push({t: t.slice(i, lt)});
        flush(); inTag = true; tagBuf = '<'; i = lt + 1;
      } else { run.push({t: t.slice(i)}); i = t.length; }
    }
  });
  flush();
}

function extract(html){
  const map = new Map();
  let ctx = '';
  const add = (k, kind) => { if(!k || !AR.test(k)) return; const o = map.get(k) || {n: 0, kinds: {}, ctx: {}}; o.n++; o.kinds[kind] = 1; if(ctx) o.ctx[ctx] = 1; map.set(k, o); };
  fromMarkup(html, add);
  const js = scriptOf(html);
  const ast = acorn.parse(js, {ecmaVersion: 2020, sourceType: 'script', allowReturnOutsideFunction: true});
  (function walk(node, parent){
    if(!node || typeof node.type !== 'string') return;
    const saved = ctx;
    if(node.type === 'FunctionDeclaration' && node.id) ctx = node.id.name;
    else if(node.type === 'VariableDeclarator' && node.id && node.id.name && /^[A-Z_0-9]+$/.test(node.id.name)) ctx = node.id.name;
    // كلمات بحث/مطابقة (مش بتظهر في الواجهة): kw: [...] و new RegExp('...')
    else if(node.type === 'Property' && node.key && /^(kw|keys|kws|aliases|match|words)$/.test(node.key.name || node.key.value || '')) ctx = (ctx || '-') + '.kw';
    else if(node.type === 'NewExpression' && node.callee && node.callee.name === 'RegExp') ctx = (ctx || '-') + '.re';
    if(node.type === 'BinaryExpression' && node.operator === '+' && !(parent && parent.type === 'BinaryExpression' && parent.operator === '+')){
      const seq = flatten(node, []);
      if(seq.some(p => !p.slot && AR.test(p.t))) runsOf(seq, add, 'js');
    } else if(node.type === 'Literal' && typeof node.value === 'string' && AR.test(node.value) && !(parent && parent.type === 'BinaryExpression' && parent.operator === '+')){
      runsOf([{t: node.value}], add, 'js');
    } else if(node.type === 'TemplateLiteral' && !(parent && parent.type === 'BinaryExpression' && parent.operator === '+')){
      const seq = flatten(node, []); if(seq.some(p => !p.slot && AR.test(p.t))) runsOf(seq, add, 'js');
    }
    for(const key in node){
      if(key === 'parent') continue;
      const v = node[key];
      if(Array.isArray(v)) v.forEach(c => walk(c, node)); else if(v && typeof v.type === 'string') walk(v, node);
    }
    ctx = saved;
  })(ast, null);
  return map;
}
module.exports = {extract, norm};
if(require.main === module){
  const ROOT = path.join(__dirname, '..');
  const map = extract(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  const out = {}; [...map.keys()].sort().forEach(k => { out[k] = Object.keys(map.get(k).ctx).join(',') || '-'; });
  fs.writeFileSync(path.join(__dirname, 'strings.json'), JSON.stringify(out, null, 0).replace(/,"/g, ',\n"'));
  const withSlot = [...map.keys()].filter(k => k.indexOf('{}') >= 0).length;
  console.log('نصوص: ' + map.size + ' (منها ' + withSlot + ' فيها قيم بتتحسب {})');
}
