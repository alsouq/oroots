/* الصلاحيات في المتصفح: موظف صلاحيته على المهام "عرض" بيخلّص مهمته هو، وصاحب صلاحية الرش بيضيف رشة لموظف،
   والموظف بيخلّصها من مهامه وحالتها في جدول الرش بتبقى "اتنفّذ"، ومحاولة تعديل مهمة غيره بتترفض من السيرفر. */
const {run, baseSeed, dd} = require('./lib');
const today = dd(0);

run('الصلاحيات: المهام وخطة الرش', async ({T, startServer, openPage, login, tab, sub, sleep, toastText}) => {
  const seed = baseSeed({
    users: [
      {id: 'u2', username: 'ali@farm.com', role: 'employee', displayName: 'Ali', permissions: {tasks: 'view', spray: 'view', water: 'edit'}},
      {id: 'u3', username: 'sam@farm.com', role: 'employee', displayName: 'Sam', permissions: {tasks: 'view', spray: 'edit'}}],
    collections: {readings: {['tasks_' + today]: {source: 'tasks', date: today, entries: [
      {id: 't1', ts: today + 'T00:00', title: 'ري الصوبة LG1', assignedTo: 'Ali', assignedEmail: 'ali@farm.com', status: 'pending', createdBy: 'boss@farm.com', checklist: [], completedAt: null},
      {id: 't2', ts: today + 'T00:00', title: 'مهمة المدير', assignedTo: 'Boss', assignedEmail: 'boss@farm.com', status: 'pending', createdBy: 'boss@farm.com', checklist: [], completedAt: null}]}}}
  });
  const S = await startServer(seed);
  const tasksOf = async () => ((await S.doc('readings/tasks_' + today)) || {entries: []}).entries;

  // 1) علي (المهام عرض بس) يخلّص مهمته من «مهامي»
  const A = await openPage(S); await login(A.p, S, 'ali@farm.com');
  await tab(A.p, 'tasks');
  const mine = await A.p.$$eval('.my-task', cs => cs.map(c => ({id: c.getAttribute('data-taskid'), enabled: !c.querySelector('.task-done-btn').disabled})));
  T.eq(mine, [{id: 't1', enabled: true}], 'علي شايف مهمته بس وزرار «تم» شغّال رغم إن صلاحيته عرض');
  T.ok(!!(await A.p.$('.view-only-banner')), 'باقي التاب عرض بس');
  await A.p.click('.my-task .task-done-btn'); await sleep(1500);
  let ts = await tasksOf();
  T.eq(ts.map(t => t.id + ':' + t.status), ['t1:done', 't2:pending'], 'اتسجّلت «تم» على السيرفر لمهمته بس');

  // 2) لو حاول (من الكونسول مثلًا) يخلّص مهمة غيره ⇒ السيرفر يرفض
  const hack = await S.api('ali@farm.com', '/api/db/commit', {writes: [{op: 'set', path: 'readings/tasks_' + today, data: {source: 'tasks', date: today, entries: ts.map(t => Object.assign({}, t, {status: 'done'}))}}]});
  T.eq(hack.status, 403, 'تعديل مهمة المدير مرفوض');

  // 3) سام (الرش تعديل) يضيف رشة لعلي
  const M = await openPage(S); await login(M.p, S, 'sam@farm.com');
  await tab(M.p, 'spray'); await sub(M.p, 'spray', 'entry');
  await M.p.fill('#sp-date', today);
  await M.p.$$eval('#sp-form input[data-hall]', cs => cs.forEach(c => { c.checked = true; }));
  await M.p.selectOption('#sp-product', '__other__'); await M.p.fill('#sp-other', 'كبريت ميكروني');
  await M.p.fill('#sp-dose', '250 جم/100 لتر');
  await M.p.selectOption('#sp-assign', 'ali@farm.com');
  await M.p.click('#sp-form button[type=submit]'); await sleep(2000);
  T.ok(/اتضاف/.test(await toastText(M.p)), 'الرشة اتضافت', await toastText(M.p));
  const plan = (await S.api('boss@farm.com', '/api/db/query', {coll: 'sprayPlan'})).j.docs || [];
  T.eq(plan.length, 1, 'فيه رشة واحدة في الخطة');
  const sp = plan[0] ? plan[0].data : {};
  T.eq([sp.product, sp.assignedEmail, sp.createdBy], ['كبريت ميكروني', 'ali@farm.com', 'sam@farm.com'], 'بيانات الرشة');
  ts = await tasksOf();
  const spTask = ts.filter(t => t.id === sp.taskId)[0];
  T.ok(spTask && spTask.assignedEmail === 'ali@farm.com' && spTask.sopTitle === 'رش وتسميد', 'المهمة المربوطة وصلت لعلي', ts.map(t => t.id));

  // 4) علي بيخلّص الرشة من مهامه ⇒ جدول الرش يقول اتنفّذ
  await sleep(1200); await tab(A.p, 'overview'); await tab(A.p, 'tasks');
  const ids = await A.p.$$eval('.my-task', cs => cs.map(c => c.getAttribute('data-taskid')));
  T.ok(ids.indexOf(sp.taskId) >= 0, 'الرشة ظاهرة في «مهامي» عند علي', ids);
  await A.p.click('.my-task[data-taskid="' + sp.taskId + '"] .task-done-btn'); await sleep(1500);
  ts = await tasksOf();
  T.eq((ts.filter(t => t.id === sp.taskId)[0] || {}).status, 'done', 'مهمة الرش اتعلّمت تم');
  await sleep(800); await tab(M.p, 'overview'); await tab(M.p, 'spray'); await sub(M.p, 'spray', 'schedule');
  const st = await M.p.evaluate(() => { const b = document.querySelector('.sp-undo'); return !!b; });
  T.ok(st, 'جدول الرش عند سام بيقول اتنفّذت (ظهر زرار «رجّعه»)');

  // 5) علي ما يقدرش يمسح الرشة أو يغيّر المنتج (حتى من برّه الواجهة)
  const del = await S.api('ali@farm.com', '/api/db/commit', {writes: [{op: 'delete', path: 'sprayPlan/' + sp.id}]});
  const chg = await S.api('ali@farm.com', '/api/db/commit', {writes: [{op: 'update', path: 'sprayPlan/' + sp.id, data: {product: 'تلاعب'}}]});
  T.eq([del.status, chg.status], [403, 403], 'مسح/تعديل الرشة من علي مرفوض');
  T.eq(A.errs.concat(M.errs), [], 'مفيش أخطاء في الصفحة');
});
