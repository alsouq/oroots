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
    ar, en, de = [x.replace('\\n', '\n') for x in (ar, en, de)]
    kind = ''
    if ar.startswith('^'): kind, ar = 'p', ar[1:]
    elif ar.startswith('~'): kind, ar = 'w', ar[1:]
    else: ar, en, de = ar.strip(), en.strip(), de.strip()
    ar = ar.replace('\u066A', '%')
    for lang, tr in (('en', en),):
        if not tr: continue
        if kind == 'p': dic[lang].setdefault('\u0001p', []).append([ar, tr])
        elif kind == 'w': dic[lang].setdefault('\u0001w', {})[ar] = tr
        else: dic[lang][ar] = tr
for lang in dic:
    if '\u0001p' in dic[lang]: dic[lang]['\u0001p'].sort(key=lambda x: -len(x[0]))
html = open(p_html, encoding='utf-8').read()
eng = open(os.path.join(root, 'i18n-engine.js'), encoding='utf-8').read()
eng = eng[eng.index('/*I18N-BEGIN*/'):eng.index('/*I18N-END*/') + len('/*I18N-END*/')]
data = '/*I18N-DATA-BEGIN*/\nvar I18N_DICT = ' + json.dumps(dic, ensure_ascii=False, separators=(',', ':')) + ';\n/*I18N-DATA-END*/'
def swap(h, b, e, new):
    i, j = h.index(b), h.index(e) + len(e)
    return h[:i] + new + h[j:]
html = swap(html, '/*I18N-BEGIN*/', '/*I18N-END*/', eng)
html = swap(html, '/*I18N-DATA-BEGIN*/', '/*I18N-DATA-END*/', data)
open(p_html, 'w', encoding='utf-8').write(html)
print('en', len(dic['en']))
