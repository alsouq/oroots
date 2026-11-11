/* O'Roots — ترجمة إشعارات السيرفر للغة كل مستخدم.
   لغة المستخدم بتتحفظ من التطبيق في userData/<email>.lang، والترجمة بنفس قاموس التطبيق (i18n/en.json + i18n-engine.js)
   مع «ترجمة بياناتي» (settings/userDict). لو مفيش ترجمة لسطر بيفضل زي ما هو. أي فشل هنا بيرجّع النص العربي. */
'use strict';
const fs = require('fs'), path = require('path');
const E = require('./i18n-engine.js');
const cache = {};
function baseDict(lang){
  if(!lang || lang === 'ar') return null;
  if(!(lang in cache)){
    try{ cache[lang] = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n', lang + '.json'), 'utf8')); }catch(e){ cache[lang] = null; }
  }
  return cache[lang];
}
/* القاموس الأساسي + ترجمات المدير (userDict.list = [{ar, en}]) */
function makeDict(lang, userList){
  const base = baseDict(lang); if(!base) return null;
  const list = Array.isArray(userList) ? userList : [];
  if(!list.length) return base;
  const d = Object.assign({}, base);
  list.forEach(x => { const a = String(x && x.ar || '').trim(), e = String(x && x[lang] || '').trim(); if(a && e) d[E.i18nKey(a)] = e.replace(/[0-9٠-٩]+(?:[.,٫][0-9٠-٩]+)?/g, '#'); });
  return d;
}
/* بيترجم كل سطر لوحده (الإشعار ممكن يبقى كذا سطر) */
function trText(text, dict){
  if(!dict || text == null) return text;
  return String(text).split('\n').map(line => { const r = E.i18nLookup(dict, line); return r == null ? line : r; }).join('\n');
}
/* لغة المستخدم من userData (مع كاش للتشغيلة دي)؛ أي خطأ = عربي */
async function langOf(db, email, memo){
  const k = String(email || '').toLowerCase();
  if(memo && k in memo) return memo[k];
  let lang = 'ar';
  try{ const s = await db.doc('userData/' + k).get(); const v = s && s.exists ? (s.data() || {}).lang : null; if(v === 'en') lang = 'en'; }catch(e){}
  if(memo) memo[k] = lang;
  return lang;
}
async function userDictList(db){
  try{ const s = await db.doc('settings/userDict').get(); return s && s.exists ? ((s.data() || {}).list || []) : []; }catch(e){ return []; }
}
module.exports = {makeDict, trText, langOf, userDictList};
