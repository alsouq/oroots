/* اختبار firestore.rules (نسخة Firebase) على محاكي Firestore: خطة الرش + المهام + الصور.
   محتاج Java ومحاكي Firestore (firebase setup:emulators:firestore)؛ لو مش موجودين الاختبار بيتخطّى نفسه. */
const {spawn, spawnSync} = require('child_process'), fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const dir = path.join(os.homedir(), '.cache', 'firebase', 'emulators');
const jarName = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^cloud-firestore-emulator-.*\.jar$/.test(f)).sort().pop() : null;
if(!jarName || spawnSync('java', ['-version']).status !== 0){ console.log('firestore-rules: متخطّى (مفيش Java أو محاكي Firestore)'); process.exit(0); }
const PORT = 8000 + Math.floor(Math.random() * 900), PROJ = 'demo-oroots', H = 'http://127.0.0.1:' + PORT;
const DOCS = H + '/v1/projects/' + PROJ + '/databases/(default)/documents';
const emu = spawn('java', ['-jar', path.join(dir, jarName), '--host=127.0.0.1', '--port=' + PORT], {stdio: ['ignore', 'pipe', 'pipe']});
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = email => b64({alg: 'none', typ: 'JWT'}) + '.' + b64({iss: 'https://securetoken.google.com/' + PROJ, aud: PROJ, sub: email, user_id: email, email, email_verified: true, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, auth_time: Math.floor(Date.now() / 1000), firebase: {sign_in_provider: 'password'}}) + '.';
const enc = v => v === null || v === undefined ? {nullValue: null} : typeof v === 'boolean' ? {booleanValue: v} : typeof v === 'number' ? (Number.isInteger(v) ? {integerValue: String(v)} : {doubleValue: v}) :
  typeof v === 'string' ? {stringValue: v} : Array.isArray(v) ? {arrayValue: {values: v.map(enc)}} : {mapValue: {fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)]))}};
const fields = o => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, enc(x)]));
const name = p => 'projects/' + PROJ + '/databases/(default)/documents/' + p;
async function commit(who, writes){
  const r = await fetch(DOCS + ':commit', {method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer ' + (who === 'owner' ? 'owner' : tok(who))}, body: JSON.stringify({writes})});
  return r.status;
}
const set = (p, o) => ({update: {name: name(p), fields: fields(o)}});
const upd = (p, o) => ({update: {name: name(p), fields: fields(o)}, updateMask: {fieldPaths: Object.keys(o)}, currentDocument: {exists: true}});
const del = p => ({delete: name(p)});
(async () => {
  for(let i = 0; i < 60; i++){ try{ await fetch(H + '/'); break; }catch(e){ await new Promise(r => setTimeout(r, 500)); } }
  const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  let r = await fetch(H + '/emulator/v1/projects/' + PROJ + ':securityRules', {method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify({rules: {files: [{name: 'firestore.rules', content: rules}]}})});
  const rt = await r.text(); if(r.status !== 200){ console.log('RULES LOAD FAILED', r.status, rt.slice(0, 1500)); emu.kill(); process.exit(1); }
  const ADMIN = 'boss@farm.com', ALI = 'ali@farm.com', SAM = 'sam@farm.com';
  assert.strictEqual(await commit('owner', [set('roles/' + ALI, {role: 'employee', perms: {water: 'edit', tasks: 'view', spray: 'view'}}), set('roles/' + SAM, {role: 'employee', perms: {spray: 'edit'}}), set('roles/' + ADMIN, {role: 'admin'})]), 200);
  const bad = []; const ok = (got, want, msg) => { if(got !== want){ bad.push(msg + ' → ' + got); console.log('✗ ' + msg + ' → ' + got); } };
  // خطة الرش
  ok(await commit(ALI, [set('sprayPlan/s1', {product: 'x'})]), 403, 'ali can not create spray');
  ok(await commit(ADMIN, [set('sprayPlan/s1', {product: 'x', assignedEmail: 'Ali@farm.com', done: false, doneAt: null, doneBy: ''})]), 200, 'admin creates spray');
  ok(await commit(ALI, [upd('sprayPlan/s1', {done: true, doneAt: 5, doneBy: ALI})]), 200, 'assignee marks done');
  ok(await commit(ALI, [upd('sprayPlan/s1', {product: 'y'})]), 403, 'assignee can not change product');
  ok(await commit(ALI, [del('sprayPlan/s1')]), 403, 'ali can not delete spray');
  ok(await commit(SAM, [set('sprayPlan/s2', {product: 'z'})]), 200, 'spray editor creates');
  ok(await commit(SAM, [del('sprayPlan/s2')]), 200, 'spray editor deletes');
  // المهام
  const T = (id, o) => Object.assign({id, title: 't' + id, assignedEmail: '', status: 'pending', createdBy: ADMIN}, o);
  const T0 = [T('1', {assignedEmail: ALI}), T('2', {assignedEmail: ADMIN}), T('3', {sopTitle: 'رش وتسميد'})];
  const tasks = (who, entries, date) => commit(who, [set('readings/tasks_2026-11-17', {source: 'tasks', date: date || '2026-11-17', entries})]);
  ok(await tasks(ADMIN, T0), 200, 'admin writes tasks');
  ok(await tasks(ALI, T0.map(t => t.id === '1' ? Object.assign({}, t, {status: 'done'}) : t)), 200, 'ali marks done');
  ok(await tasks(ALI, T0.slice(0, 2)), 403, 'ali can not remove a task');
  ok(await tasks(ALI, T0, '2026-11-18'), 403, 'ali can not change doc date');
  ok(await tasks(ALI, T0.concat([T('4', {assignedEmail: ALI, createdBy: ALI})])), 200, 'ali adds (recurring)');
  ok(await tasks(SAM, T0.filter(t => t.id !== '3')), 200, 'spray editor removes spray task');
  ok(await commit(ALI, [set('readings/tasks_2026-11-20', {source: 'tasks', date: '2026-11-20', entries: [T('9', {assignedEmail: ALI, createdBy: ALI})]})]), 200, 'ali creates new day doc');
  ok(await commit(ALI, [set('qualityPhotos/p1', {data: 'x'})]), 403, 'ali can not add photos');
  ok(await commit(ADMIN, [set('qualityPhotos/p1', {data: 'x'})]), 200, 'admin adds photos');
  ok(await commit(ALI, [del('qualityPhotos/p1')]), 403, 'ali can not delete photos');
  ok(await commit(ALI, [set('readings/irrigation_S1_2026-11-17', {source: 'irrigation', date: '2026-11-17', entries: []})]), 200, 'water still works');
  emu.kill();
  assert.strictEqual(bad.length, 0, 'قواعد Firestore مش زي المتوقع');
  console.log('firestore-rules OK');
})().catch(e => { console.log('ERR', e); emu.kill(); process.exit(1); });
