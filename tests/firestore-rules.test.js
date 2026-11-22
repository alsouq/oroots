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
  // تعبئة الخزانات وسجل المواسير
  ok(await commit(ALI, [set('waterFills/f1', {id: 'f1', liters: 450})]), 200, 'water editor saves a tank fill');
  ok(await commit(SAM, [set('waterFills/f2', {id: 'f2', liters: 1})]), 403, 'spray-only user can not save a fill');
  ok(await commit(ALI, [del('waterFills/f1')]), 403, 'fills deleted by admin only');
  ok(await commit(ALI, [set('settings/tankDims', {list: [], price: 8})]), 200, 'water editor sets tank dimensions');
  ok(await commit(SAM, [set('settings/tankDims', {list: [], price: 1})]), 403, 'non-water user can not set dimensions');
  ok(await commit(ADMIN, [set('pipeSnaps/S1_2026-11-20', {systemId: 'S1'})]), 403, 'pipe snapshots are written by the server only');
  // جرد المشتل وتسليم/تسلم
  const NUR = 'nur@farm.com';
  assert.strictEqual(await commit('owner', [set('roles/' + NUR, {role: 'employee', perms: {nursery: 'edit'}})]), 200);
  ok(await commit(NUR, [set('nurseryHandovers/h1', {id: 'h1', by: NUR, toEmail: SAM, status: 'pending', rows: []})]), 200, 'nursery editor creates a handover');
  ok(await commit(ALI, [set('nurseryHandovers/h2', {id: 'h2', by: ALI, rows: []})]), 403, 'no nursery permission can not create');
  ok(await commit(NUR, [set('nurseryHandovers/h3', {id: 'h3', by: NUR, toEmail: SAM, status: 'accepted', toApprovedAt: 1, toApprovedBy: NUR, rows: []})]), 403, 'can not pre-approve on create');
  ok(await commit(NUR, [upd('nurseryHandovers/h1', {status: 'accepted', toApprovedAt: 5, toApprovedBy: NUR})]), 403, 'sender can not approve for the receiver');
  ok(await commit(SAM, [upd('nurseryHandovers/h1', {totalCounted: 99})]), 403, 'receiver can not edit the record');
  ok(await commit(SAM, [upd('nurseryHandovers/h1', {status: 'accepted', toApprovedAt: 5, toApprovedBy: SAM})]), 200, 'receiver approves');
  ok(await commit(SAM, [upd('nurseryHandovers/h1', {status: 'disputed', toApprovedAt: 6, toApprovedBy: SAM, toNote: 'x'})]), 403, 'no change after approval');
  ok(await commit(NUR, [del('nurseryHandovers/h1')]), 403, 'delete by admin only');
  // المستويات والملاحظات
  const USR = 'usr@farm.com', SUP = 'sup2@farm.com', OPR = 'opr@farm.com';
  assert.strictEqual(await commit('owner', [set('roles/' + USR, {role: 'employee', level: 'user', perms: {harvest: 'edit', quality: 'edit', inventory: 'view'}}),
    set('roles/' + SUP, {role: 'employee', level: 'supervisor', perms: {harvest: 'edit', quality: 'edit', inventory: 'edit'}}),
    set('roles/' + OPR, {role: 'employee', level: 'operator', perms: {harvest: 'edit'}})]), 200);
  const hv = (id, by, ca) => set('harvest/' + id, {id, by, quantity: 1, createdAt: ca || Date.now()});
  ok(await commit(USR, [hv('x1', USR)]), 200, 'user records harvest');
  ok(await commit(USR, [upd('harvest/x1', {quantity: 2})]), 200, 'user edits own record');
  await commit(ADMIN, [hv('x2', ADMIN)]);
  ok(await commit(USR, [upd('harvest/x2', {quantity: 2})]), 403, 'user can not edit another record');
  ok(await commit(SUP, [upd('harvest/x2', {quantity: 3})]), 200, 'supervisor edits any record');
  ok(await commit(USR, [del('harvest/x1')]), 403, 'user can not delete');
  ok(await commit(SUP, [del('harvest/x1')]), 200, 'supervisor deletes');
  await commit(ADMIN, [hv('x3', OPR, Date.now() - 2 * 86400000), hv('x4', OPR)]);
  ok(await commit(OPR, [upd('harvest/x3', {quantity: 2})]), 403, 'operator can not edit after 24 hours');
  ok(await commit(OPR, [upd('harvest/x4', {quantity: 2})]), 200, 'operator edits own record within 24 hours');
  ok(await commit(USR, [set('costs/k1', {id: 'k1', amount: 1})]), 403, 'costs are for supervisors');
  ok(await commit(SUP, [set('costs/k1', {id: 'k1', amount: 1})]), 200, 'supervisor saves a cost');
  ok(await commit(USR, [set('qualityOrders/o1', {id: 'o1'})]), 403, 'orders are for supervisors');
  const nt = (id, by, coll) => set('recordNotes/' + id, {id, coll, targetId: 'x4', text: 'ok', by, createdAt: 1});
  ok(await commit(USR, [nt('n1', USR, 'harvest')]), 200, 'a note on a harvest record');
  ok(await commit(ALI, [nt('n2', ALI, 'harvest')]), 403, 'no view permission on the tab, no note');
  ok(await commit(USR, [nt('n3', ADMIN, 'harvest')]), 403, 'a note under another name');
  ok(await commit(USR, [upd('recordNotes/n1', {text: 'edited'})]), 403, 'notes can not be edited');
  ok(await commit(USR, [del('recordNotes/n1')]), 403, 'user can not delete notes');
  ok(await commit(SUP, [del('recordNotes/n1')]), 200, 'supervisor deletes notes');
  emu.kill();
  assert.strictEqual(bad.length, 0, 'قواعد Firestore مش زي المتوقع');
  console.log('firestore-rules OK');
})().catch(e => { console.log('ERR', e); emu.kill(); process.exit(1); });
