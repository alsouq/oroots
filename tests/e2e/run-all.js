/* تشغيل كل اختبارات المتصفح ورا بعض:  node tests/e2e/run-all.js   (أو اسم اختبار: node tests/e2e/run-all.js offline)
   محتاج Playwright مرة واحدة:  npm i -D playwright && npx playwright install chromium */
'use strict';
const fs = require('fs'), path = require('path'), {spawnSync} = require('child_process');
const only = process.argv.slice(2);
const files = fs.readdirSync(__dirname).filter(f => /\.e2e\.js$/.test(f)).filter(f => !only.length || only.some(o => f.indexOf(o) >= 0)).sort();
const res = [];
for(const f of files){
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], {stdio: 'inherit'});
  res.push({f, ok: r.status === 0, s: Math.round((Date.now() - t0) / 1000)});
}
console.log('\n— النتيجة —');
res.forEach(r => console.log((r.ok ? '✓ ' : '✗ ') + r.f + '  (' + r.s + ' ث)'));
const bad = res.filter(r => !r.ok).length;
console.log(bad ? bad + ' اختبار فشل' : 'كله تمام');
process.exit(bad ? 1 : 0);
