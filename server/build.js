/* O'Roots — بيجهّز نسخة التطبيق للسيرفر المحلي في server/public:
   نفس index.html بالظبط، بس مكتبات Firebase اتبدلت بـ local-firebase.js (والـ CSP اتظبط). server.js بيشغّله لوحده كل ما يبدأ، أو يدوي:
     node server/build.js            (من فولدر المشروع) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), DEF_OUT = path.join(__dirname, 'public');

function transform(html){
  const before = html;
  html = html.replace(/<link rel="preload" as="script" href="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+">\s*/g, '');
  let first = true;
  html = html.replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>\s*/g, () => { if(first){ first = false; return '<script src="local-firebase.js"></script>\n'; } return ''; });
  if(first) throw new Error('مش لاقي سكربتات Firebase في index.html');
  html = html.replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src )/, "$1'self' ");
  if(html === before) throw new Error('التحويل ما غيّرش حاجة');
  return html;
}
/* الـ service worker: طلبات /api/ (الداتا + التحديث اللحظي + الدخول) لازم تعدّي للسيرفر على طول وما تتخزّنش في الكاش */
function transformSw(js){
  const a = 'var url = new URL(req.url);\n';
  if(js.indexOf(a) < 0) throw new Error('مش لاقي مكان التعديل في sw.js');
  js = js.replace(a, a + "  if(url.origin === self.location.origin && url.pathname.indexOf('/api/') === 0) return;   // السيرفر المحلي: الداتا ما بتتخزّنش\n");
  // مكتبة السيرفر المحلي لازم تتخزّن من أول مرة: من غيرها التطبيق ما يفتحش من غير نت
  const b = "var PRECACHE = ['index.html', ";
  if(js.indexOf(b) < 0) throw new Error('مش لاقي PRECACHE في sw.js');
  return js.replace(b, b + "'local-firebase.js', 'cooling-sim.js', 'vendor/three.min.js', ");
}
function build(out){
  const OUT = out || DEF_OUT;
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(path.join(OUT, 'index.html'), transform(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
  fs.copyFileSync(path.join(__dirname, 'local-firebase.js'), path.join(OUT, 'local-firebase.js'));
  fs.writeFileSync(path.join(OUT, 'sw.js'), transformSw(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')));
  const copy = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon.ico', 'favicon.png'];
  copy.forEach(f => { const p = path.join(ROOT, f); if(fs.existsSync(p)) fs.copyFileSync(p, path.join(OUT, f)); });
  // محاكي التبريد (بيتحمّل لما حد يفتح التاب): الكود + مكتبة three.js
  fs.copyFileSync(path.join(ROOT, 'cooling-sim.js'), path.join(OUT, 'cooling-sim.js'));
  fs.mkdirSync(path.join(OUT, 'vendor'), {recursive: true});
  fs.copyFileSync(path.join(ROOT, 'vendor', 'three.min.js'), path.join(OUT, 'vendor', 'three.min.js'));
  fs.mkdirSync(path.join(OUT, 'i18n'), {recursive: true});
  fs.readdirSync(path.join(ROOT, 'i18n')).filter(f => /\.json$/.test(f)).forEach(f => fs.copyFileSync(path.join(ROOT, 'i18n', f), path.join(OUT, 'i18n', f)));
  return OUT;
}
module.exports = {transform, transformSw, build};
if(require.main === module){ console.log('اتجهّز: ' + build()); }
