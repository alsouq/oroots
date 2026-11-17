/* اختبار المحلّل الذكي على السيرفر المحلي: الإعدادات + إخفاء المفاتيح + الصلاحيات + التشغيل في الخلفية (محلي وClaude) + الحد اليومي + الأخطاء.
   بيستخدم سيرفرين وهميين: واحد بواجهة OpenAI (زي Ollama) وواحد بواجهة Claude (streaming). */
'use strict';
process.removeAllListeners('warning');
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

const got = {openai: [], claude: []};
let claudeMode = 'ok';
const fake = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const body = b ? JSON.parse(b) : {};
    if(req.url.indexOf('/v1/chat/completions') === 0){
      got.openai.push({headers: req.headers, body});
      if(body.model === 'missing'){ res.writeHead(404, {'Content-Type': 'application/json'}); return res.end(JSON.stringify({error: {message: 'model not found'}})); }
      res.writeHead(200, {'Content-Type': 'application/json'});
      return res.end(JSON.stringify({model: body.model, choices: [{message: {role: 'assistant', content: '<think>بفكر</think>## الوضع العام\nكل حاجة تمام'}, finish_reason: 'stop'}], usage: {prompt_tokens: 120, completion_tokens: 30}}));
    }
    if(req.url.indexOf('/v1/messages') === 0){
      got.claude.push({headers: req.headers, body, url: req.url});
      const ev = (t, d) => 'event: ' + t + '\ndata: ' + JSON.stringify(Object.assign({type: t}, d)) + '\n\n';
      res.writeHead(200, {'Content-Type': 'text/event-stream'});
      res.write(ev('message_start', {message: {id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: {input_tokens: 900, output_tokens: 1}}}));
      if(claudeMode === 'ok'){
        res.write(ev('content_block_start', {index: 0, content_block: {type: 'text', text: ''}}));
        res.write(ev('content_block_delta', {index: 0, delta: {type: 'text_delta', text: '## الوضع العام\nالمزرعة '}}));
        res.write(ev('content_block_delta', {index: 0, delta: {type: 'text_delta', text: 'كويسة'}}));
        res.write(ev('content_block_stop', {index: 0}));
      }
      res.write(ev('message_delta', {delta: {stop_reason: claudeMode === 'ok' ? 'end_turn' : 'refusal', stop_sequence: null}, usage: {output_tokens: 40}}));
      res.write(ev('message_stop', {}));
      return res.end();
    }
    res.writeHead(404); res.end();
  });
});

(async () => {
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  const FAKE = 'http://127.0.0.1:' + fake.address().port;
  process.env.ANTHROPIC_BASE_URL = FAKE;   // مكتبة Claude الرسمية بتقرا العنوان ده
  const {createServer} = require('../server/server.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oroots-ai-')), ADMIN = 'boss@farm.com';
  const cfg = {port: 0, host: '127.0.0.1', dataDir: path.join(tmp, 'data'), publicDir: path.join(tmp, 'public'), backupDir: path.join(tmp, 'b'), adminEmail: ADMIN, jobs: false};
  fs.mkdirSync(cfg.publicDir, {recursive: true}); fs.writeFileSync(path.join(cfg.publicDir, 'index.html'), 'ok');
  const app = createServer(cfg);
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const call = async (m, u, body, tok) => { const r = await fetch(base + u, {method: m, headers: Object.assign({'content-type': 'application/json'}, tok ? {authorization: 'Bearer ' + tok} : {}), body: body ? JSON.stringify(body) : undefined}); return {status: r.status, j: await r.json().catch(() => ({})), raw: r}; };
  const pw = fs.readFileSync(path.join(cfg.dataDir, 'first-admin.txt'), 'utf8').split('\n')[1].replace(/.*: /, '').trim();
  const A = (await call('POST', '/api/auth/login', {email: ADMIN, password: pw})).j.token;
  const waitDone = async id => { for(let i = 0; i < 100; i++){ const d = app.store.get('aiReports/' + id); if(d && d.data.status !== 'running') return d.data; await new Promise(r => setTimeout(r, 50)); } throw new Error('timeout ' + id); };

  // موظفين: من غير صلاحية، عرض بس، تشغيل
  const emp = async (email, perms) => {
    assert.strictEqual((await call('POST', '/api/auth/create', {email, password: 'secret1'}, A)).status, 200);
    await call('POST', '/api/db/commit', {writes: [{op: 'set', path: 'roles/' + email, data: {role: 'employee', perms}}]}, A);
    return (await call('POST', '/api/auth/login', {email, password: 'secret1'})).j.token;
  };
  const N = await emp('none@farm.com', {water: 'edit'}), V = await emp('view@farm.com', {ai: 'view'}), E = await emp('edit@farm.com', {ai: 'edit'});

  // الإعدادات: المحلي افتراضي، المفاتيح ما بتطلعش أبدًا
  let c = (await call('GET', '/api/ai/config', null, A)).j;
  assert.strictEqual(c.default, 'local'); assert.strictEqual(c.providers.filter(p => p.id === 'local')[0].ready, false, 'المحلي محتاج اسم موديل');
  assert.strictEqual((await call('POST', '/api/ai/config', {providers: {local: {model: 'x'}}}, E)).status, 403, 'الموظف ما يغيّرش الإعدادات');
  c = (await call('POST', '/api/ai/config', {perDay: 4, providers: {local: {baseUrl: FAKE + '/v1', model: 'qwen-test'}, claude: {apiKey: 'sk-ant-SECRET-1234', effort: 'high'}, custom: {baseUrl: 'ftp://bad', model: 'm'}}}, A));
  assert.strictEqual(c.status, 400, 'عنوان غلط بيترفض');
  c = (await call('POST', '/api/ai/config', {perDay: 4, providers: {local: {baseUrl: FAKE + '/v1', model: 'qwen-test'}, claude: {apiKey: 'sk-ant-SECRET-1234', effort: 'high'}}}, A)).j;
  const cl = c.providers.filter(p => p.id === 'claude')[0];
  assert(cl.ready && cl.hasKey && cl.keyHint === '…1234' && cl.model === 'claude-opus-5-5');
  assert(JSON.stringify(c).indexOf('SECRET') < 0, 'المفتاح ما بيرجعش للمتصفح');
  const cv = (await call('GET', '/api/ai/config', null, V)).j;
  assert(cv.providers && !('hasKey' in cv.providers[0]) && !('baseUrl' in cv.providers[0]), 'الموظف بيشوف أسماء المزوّدين بس');
  assert.strictEqual((await call('GET', '/api/ai/config', null, N)).status, 403);
  // حفظ تاني من غير مفتاح ما بيمسحش المفتاح القديم
  c = (await call('POST', '/api/ai/config', {providers: {claude: {model: 'claude-opus-5-5'}}}, A)).j;
  assert(c.providers.filter(p => p.id === 'claude')[0].hasKey);

  // اختبار المزوّد
  const t = (await call('POST', '/api/ai/test', {provider: 'local'}, A)).j;
  assert(t.ok && t.model === 'qwen-test', JSON.stringify(t));

  // صلاحيات التشغيل
  const snap = {kind: 'farm', date: '2026-11-17', systems: [{name: 'S1', water: {drainage: {ec: {avg: 3.1}}}}]};
  assert.strictEqual((await call('POST', '/api/ai/run', {kind: 'farm', snapshot: snap}, N)).status, 403);
  assert.strictEqual((await call('POST', '/api/ai/run', {kind: 'farm', snapshot: snap}, V)).status, 403, 'عرض بس = ما يشغّلش');
  assert.strictEqual((await call('POST', '/api/ai/run', {kind: 'xyz', snapshot: snap}, A)).status, 400);

  // تشغيل محلي (الافتراضي) من موظف عنده صلاحية
  let r = await call('POST', '/api/ai/run', {kind: 'farm', lang: 'ar', snapshot: snap, question: 'ليه EC الصرف عالي؟'}, E);
  assert.strictEqual(r.status, 200); let d = await waitDone(r.j.id);
  assert.strictEqual(d.status, 'done'); assert.strictEqual(d.text, '## الوضع العام\nكل حاجة تمام', 'التفكير <think> بيتشال');
  assert.strictEqual(d.provider, 'local'); assert.strictEqual(d.by, 'edit@farm.com'); assert.deepStrictEqual(d.sent, snap);
  const o = got.openai[got.openai.length - 1].body;
  assert.strictEqual(o.messages[0].role, 'system'); assert(/مهندس زراعي/.test(o.messages[0].content) && /ما تحسبش جرعات/.test(o.messages[0].content));
  assert(o.messages[1].content.indexOf('"avg":3.1') > 0 && o.messages[1].content.indexOf('ليه EC الصرف عالي؟') > 0, 'البيانات والسؤال وصلوا');
  assert(!got.openai[got.openai.length - 1].headers.authorization, 'المحلي من غير مفتاح');

  // Claude بالمكتبة الرسمية: streaming + fallbacks + effort
  r = await call('POST', '/api/ai/run', {kind: 'mix', lang: 'en', provider: 'claude', snapshot: {kind: 'mix'}}, A);
  d = await waitDone(r.j.id);
  assert.strictEqual(d.status, 'done', JSON.stringify(d)); assert.strictEqual(d.text, '## الوضع العام\nالمزرعة كويسة');
  assert.deepStrictEqual(d.usage, {input: 900, output: 40});
  const q = got.claude[got.claude.length - 1];
  assert.strictEqual(q.body.model, 'claude-opus-5-5'); assert.strictEqual(q.body.stream, true); assert.strictEqual(q.body.fallbacks, 'default');
  assert.deepStrictEqual(q.body.output_config, {effort: 'high'}); assert(String(q.headers['anthropic-beta']).indexOf('server-side-fallback-2026-07-01') >= 0);
  assert.strictEqual(q.headers.authorization || ('Bearer ' + q.headers['x-api-key']), 'Bearer sk-ant-SECRET-1234', 'المفتاح بيروح لـ Claude من السيرفر');
  // رفض من النموذج
  claudeMode = 'refusal';
  r = await call('POST', '/api/ai/run', {kind: 'spray', provider: 'claude', snapshot: {kind: 'spray'}}, A);
  d = await waitDone(r.j.id); assert.strictEqual(d.status, 'error'); assert.strictEqual(d.error, 'refusal');
  claudeMode = 'ok';

  // الحد اليومي (4): اتعمل 3 لحد دلوقتي
  r = await call('POST', '/api/ai/run', {kind: 'farm', provider: 'local', snapshot: snap}, A); await waitDone(r.j.id);
  r = await call('POST', '/api/ai/run', {kind: 'farm', provider: 'local', snapshot: snap}, A);
  assert.strictEqual(r.status, 429); assert.strictEqual(r.j.error, 'daily-limit');

  // الصلاحيات على التقارير نفسها
  const list = (tok) => call('POST', '/api/db/query', {coll: 'aiReports', orderBy: [{f: 'createdAt', dir: 'desc'}]}, tok);
  const lv = await list(V); assert.strictEqual(lv.status, 200); assert.strictEqual(lv.j.docs.length, 4, 'العرض بس بيشوف التقارير');
  const ln = await list(N); assert.strictEqual((ln.j.docs || []).length, 0, 'من غير صلاحية ما بيشوفش');
  const id0 = lv.j.docs[0].id;
  assert.strictEqual((await call('POST', '/api/db/commit', {writes: [{op: 'update', path: 'aiReports/' + id0, data: {text: 'تلاعب'}}]}, E)).status, 403, 'محدش يعدّل التقرير');
  assert.strictEqual((await call('POST', '/api/db/commit', {writes: [{op: 'delete', path: 'aiReports/' + id0}]}, E)).status, 403);
  assert.strictEqual((await call('POST', '/api/db/commit', {writes: [{op: 'delete', path: 'aiReports/' + id0}]}, A)).status, 200, 'المدير بيمسح');

  // مزوّد مش شغّال ⇒ خطأ واضح
  await call('POST', '/api/ai/config', {perDay: 50, providers: {local: {baseUrl: 'http://127.0.0.1:9/v1'}}}, A);
  r = await call('POST', '/api/ai/run', {kind: 'farm', provider: 'local', snapshot: snap}, A);
  d = await waitDone(r.j.id); assert.strictEqual(d.status, 'error'); assert.strictEqual(d.error, 'network');
  await call('POST', '/api/ai/config', {providers: {local: {baseUrl: FAKE + '/v1', model: 'missing'}}}, A);
  r = await call('POST', '/api/ai/run', {kind: 'farm', provider: 'local', snapshot: snap}, A);
  d = await waitDone(r.j.id); assert.strictEqual(d.error, 'model');

  // تحليل كان شغّال والسيرفر وقف ⇒ بيتعلّم «اتقطع» لما السيرفر يرجع
  app.store.commit([{op: 'set', path: 'aiReports/stuck1', data: {kind: 'farm', status: 'running', createdAt: Date.now()}}]);
  require('../server/ai').routes({store: app.store, rules: app.rules, send(){}, need(){}});
  assert.strictEqual(app.store.get('aiReports/stuck1').data.error, 'interrupted');

  app.server.close(); fake.close(); app.store.close();
  console.log('local-ai OK');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
