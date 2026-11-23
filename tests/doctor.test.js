/* فحص التثبيت (server/doctor.js): كل ملف السيرفر بيطلبه لازم يكون في قايمة الملفات المطلوبة (عشان تحديث ناقص يتكشف بدل ما السيرفر يقع من غير تفسير)،
   وغلطات config.json بتتشرح بمكانها. */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const D = require('../server/doctor.js');
const ROOT = path.join(__dirname, '..');

// 1) كل الملفات المطلوبة موجودة في المشروع
assert.deepStrictEqual(D.missingFiles(), [], 'ملفات ناقصة في المشروع');

// 2) أي require('./x') أو require('../x') في server/*.js و server/ai/*.js لازم يكون ملفه في REQUIRED
const need = new Set();
const scan = dir => fs.readdirSync(dir).filter(f => /\.js$/.test(f)).forEach(f => {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  for(const m of src.matchAll(/require\('(\.{1,2}\/[^']+)'\)/g)){
    let p = path.resolve(dir, m[1]); if(!/\.(js|json)$/.test(p)) p = fs.existsSync(p + '.js') ? p + '.js' : path.join(p, 'index.js');
    const rel = path.relative(ROOT, p).replace(/\\/g, '/');
    if(/\.js$/.test(rel) && !/^tests\//.test(rel)) need.add(rel);
  }
});
scan(path.join(ROOT, 'server')); scan(path.join(ROOT, 'server', 'ai'));
const notListed = [...need].filter(f => D.REQUIRED.indexOf(f) < 0);
assert.deepStrictEqual(notListed, [], 'ملفات السيرفر بيطلبها وناقصة من قايمة doctor.js: ' + notListed.join(', '));

// 3) غلطة JSON بمكانها
const bad = '{\n  "port": 8080\n  "appUrl": "x"\n}';
try{ JSON.parse(bad); assert.fail('لازم يفشل'); }catch(e){ if(e.code === 'ERR_ASSERTION') throw e; assert(/سطر 3/.test(D.jsonProblem(bad, e)), D.jsonProblem(bad, e)); }

// 4) فحص الإعدادات (config.json)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oroots-doc-'));
const check = obj => { const p = path.join(tmp, 'c.json'); fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj)); process.env.OROOTS_CONFIG = p; return D.checkConfig().out; };
const has = (out, kind, re) => out.some(o => o[0] === kind && re.test(o[1]));
assert(has(check('{"port": 8080 "x": 1}'), 'fail', /سطر/), 'JSON غلط');
assert(has(check({port: 8080, appUrl: 'https://farm.tail1.ts.net'}), 'ok', /سليم/), 'إعداد سليم');
assert(has(check({appUrl: 'farm.ts.net'}), 'fail', /appUrl/), 'appUrl من غير https');
assert(has(check({appUrl: 'https://اسم-الجهاز.tailXXXX.ts.net'}), 'fail', /appUrl/), 'appUrl مثال');
assert(has(check({appUrl: 'https://a.ts.net', mail: {host: 'smtp.gmail.com', user: 'a@gmail.com'}}), 'fail', /mail/), 'mail ناقص');
assert(has(check({appUrl: 'https://a.ts.net', mail: {host: 'smtp.gmail.com', user: 'a@gmail.com', pass: 'xxxx xxxx xxxx xxxx'}}), 'fail', /القيم المثال/), 'mail مثال');
assert(has(check({appUrl: 'https://a.ts.net', mail: {host: 'smtp.gmail.com', user: 'farm@gmail.com', pass: 'abcd efgh ijkl mnop'}}), 'ok', /الإيميل/), 'mail سليم');
delete process.env.OROOTS_CONFIG;
console.log('doctor OK');
