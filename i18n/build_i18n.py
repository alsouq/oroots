#!/usr/bin/env python3
"""بيبني قاموس الترجمة من i18n/dict.tsv (عمود: عربي \t English \t Deutsch) ويحطه في index.html + بيزامن محرك الترجمة."""
import json, re, sys, os
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
p_html = os.path.join(root, 'index.html')
dic = {'en': {}}   # الألماني اتشال مؤقتًا (عمود de في dict.tsv لسه محفوظ)
for ln, line in enumerate(open(os.path.join(root, 'i18n', 'dict.tsv'), encoding='utf-8').read().split('\n'), 1):
    if not line.strip() or line.startswith('//'): continue
    parts = line.split('\t')
    if len(parts) < 3: sys.exit('dict.tsv:%d عدد الأعمدة غلط: %r' % (ln, line[:60]))
    ar, en, de = parts[0], parts[1], parts[2]
    ar, en, de = [x.replace('\\n', '\n').replace('\\t', '\t') for x in (ar, en, de)]
    kind = ''
    if ar.startswith('^'): kind, ar = 'p', ar[1:]
    elif ar.startswith('~'): kind, ar = 'w', ar[1:]
    else: ar, en, de = ar.strip(), en.strip(), de.strip()
    ar = ar.replace('\u066A', '%')
    # قيمتين لازقين في بعض في القالب ({}{}) = قيمة واحدة (مفيش طريقة نعرف فين واحدة بتخلص والتانية بتبدأ)
    if '{}{}' in ar:
        ar = re.sub(r'(\{\}){2,}', '{}', ar); en = re.sub(r'(\{\}){2,}', '{}', en)
    for lang, tr in (('en', en),):
        if not tr: continue
        if kind == 'p': dic[lang].setdefault('\u0001p', []).append([ar, tr])
        elif kind == 'w': dic[lang].setdefault('\u0001w', {})[ar] = tr
        else: dic[lang][ar] = tr
# القوالب: {} في العربي لازم يقابلها {} بنفس العدد (أو {0} {1}...) في الترجمة، و # بنفس العدد
_bad = []
for lang in dic:
    for k, v in dic[lang].items():
        if not isinstance(v, str) or k.startswith('\u0001'): continue
        ns = k.count('{}')
        if ns:
            pos = [int(x) for x in re.findall(r'\{(\d+)\}', v)]
            if pos:
                if max(pos) >= ns or v.count('{}'): _bad.append(k)
            elif v.count('{}') != ns: _bad.append(k)
        elif '{}' in v: _bad.append(k)
        if k.count('#') != v.count('#') and '{' not in k: pass   # الأرقام: الترجمة ممكن تحذف رقم (زي «سنة واحدة») — مسموح
if _bad: sys.exit('قوالب الترجمة فيها عدد {} مختلف:\n' + '\n'.join(_bad[:20]))
# التطبيق بيستبدل الإيموجي بأيقونات SVG، فالنص بيوصل من غيرها: بنضيف نسخة من غير الإيموجي لكل مفتاح (زي ما المحرك بيعمل)
_lead = re.compile(r"^[^\u0600-\u06FFA-Za-z0-9(«\"'#{]+")
_emo = re.compile('(?:[\u231A-\u23FF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D]|[\U0001F000-\U0001FFFF])+')
def _noemo(x): return re.sub(r'\s+', ' ', _emo.sub(' ', x)).strip()
for lang in dic:
    d = dic[lang]
    for k in list(d.keys()):
        if not isinstance(d[k], str) or k.startswith('\u0001'): continue
        k2 = _lead.sub('', k).strip(); v2 = _lead.sub('', d[k]).strip()
        if k2 and v2 and k2 != k and k2 not in d: d[k2] = v2
        k3 = _noemo(k); v3 = _noemo(d[k])
        if k3 and v3 and k3 != k and k3 not in d: d[k3] = v3
for lang in dic:
    if '\u0001p' in dic[lang]: dic[lang]['\u0001p'].sort(key=lambda x: -len(x[0]))
html = open(p_html, encoding='utf-8').read()
eng = open(os.path.join(root, 'i18n-engine.js'), encoding='utf-8').read()
eng = eng[eng.index('/*I18N-BEGIN*/'):eng.index('/*I18N-END*/') + len('/*I18N-END*/')]
import hashlib
# القاموس بيتكتب في ملف منفصل لكل لغة (i18n/en.json) وبيتحمّل وقت الحاجة بس؛ جوه index.html بس رقم النسخة
ver = {}
for lang in dic:
    js = json.dumps(dic[lang], ensure_ascii=False, separators=(',', ':'))
    open(os.path.join(root, 'i18n', lang + '.json'), 'w', encoding='utf-8').write(js)
    ver[lang] = hashlib.sha256(js.encode('utf-8')).hexdigest()[:12]
vstr = '-'.join(ver[k] for k in sorted(ver))
data = '/*I18N-DATA-BEGIN*/\nvar I18N_DICT = {}; var I18N_VER = ' + json.dumps(vstr) + ';\n/*I18N-DATA-END*/'
def swap(h, b, e, new):
    i, j = h.index(b), h.index(e) + len(e)
    return h[:i] + new + h[j:]
html = swap(html, '/*I18N-BEGIN*/', '/*I18N-END*/', eng)
html = swap(html, '/*I18N-DATA-BEGIN*/', '/*I18N-DATA-END*/', data)
# منطق التكاليف المشترك (cost-logic.js) بيتنسخ حرفيًا جوه index.html
cl = open(os.path.join(root, 'cost-logic.js'), encoding='utf-8').read()
cl = cl[cl.index('/*COSTLOGIC-BEGIN*/'):cl.index('/*COSTLOGIC-END*/') + len('/*COSTLOGIC-END*/')]
html = swap(html, '/*COSTLOGIC-BEGIN*/', '/*COSTLOGIC-END*/', cl)
open(p_html, 'w', encoding='utf-8').write(html)
print('en', len(dic['en']))
