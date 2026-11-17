const assert = require('assert');
const R = require('../send-reminders.js');
// Firestore وهمي: data = {path: obj}
function fakeDb(data){
  const snap = (path) => ({id: path.split('/').pop(), exists: path in data, data: () => data[path]});
  const ref = (path) => ({path, get: async () => snap(path), set: async (d, o) => { data[path] = (o && o.merge) ? Object.assign(data[path] || {}, d) : d; }, delete: async () => { delete data[path]; }});
  return {
    doc: ref,
    getAll: async (...refs) => refs.map(r => snap(r.path)),
    collection: (c) => ({
      doc: (id) => ref(c + '/' + id),
      get: async () => ({docs: Object.keys(data).filter(k => k.startsWith(c + '/')).map(k => snap(k))}),
      where: (f, op, v) => ({get: async () => ({docs: Object.keys(data).filter(k => k.startsWith(c + '/') && data[k][f] === v).map(k => snap(k))})})
    })
  };
}
(async () => {
  const today = '2026-11-06', yest = '2026-11-05';
  const users = [
    {username:'admin@x.com', role:'admin', displayName:'المدير'},
    {username:'ali@x.com', role:'employee', displayName:'علي', permissions:{water:'edit', climate:'view', inventory:'none'}},
    {username:'omar@x.com', role:'employee', displayName:'عمر', permissions:{soil:'edit', climate:'edit', inventory:'edit'}},
    {username:'view@x.com', role:'employee', displayName:'مشاهد', permissions:{water:'view'}}
  ];
  const systems = [{id:'S1', greenhouse:'LG1', name:'S1'}, {id:'T1', greenhouse:'TG', name:'T1', gtype:'fruit'}];
  // أهداف مطلوبة
  const targets = R.expectedTargets(systems);
  assert.deepStrictEqual(targets.map(t => t.kind + ':' + t.id), ['water:S1', 'soil:T1', 'climate:LG1', 'climate:TG']);
  assert.deepStrictEqual(R.recipientsFor(users, 'soil').sort(), ['admin@x.com', 'ali@x.com', 'omar@x.com'], 'التربة بتتبع المياه لو مش متحددة');
  assert.deepStrictEqual(R.recipientsFor(users, 'water').sort(), ['admin@x.com', 'ali@x.com'], 'التربة مش بتدخل في المياه، والمياه بتدخل التربة لو مفيش soil');
  // الصلاحية: soil بترجع على water لو مش متحددة
  assert.ok(R.canEditTab({role:'employee', permissions:{water:'edit'}}, 'soil'));
  // ناقص
  const docs = new Map([[R.rid('irrigation','S1',today), {entries:[{ts:'x'}]}], [R.rid('climate','LG1',today), {entries:[]}]]);
  assert.deepStrictEqual(R.findMissing(targets, docs, today).map(t => t.id), ['T1', 'LG1', 'TG']);
  // خارج المدى + انحراف
  const cfg = {ph:[5.5,6.5], ec:[1.2,3.0], temp:[18,26]};
  const wd = new Map([
    [R.rid('irrigation','S1',today), {entries:[{ts:'2026-11-06T08:00', ph:7.1, ec:2.0, temp:24}]}],
    [R.rid('drainage','S1',today), {entries:[{ts:'2026-11-06T08:05', ph:6.0, ec:3.1, temp:24}]}]
  ]);
  const wi = R.waterIssues(systems, wd, cfg, today);
  assert.ok(wi.some(l => l.includes('pH الري 7.1')) && wi.some(l => l.includes('EC الصرف أعلى')) && wi.some(l => l.includes('pH الصرف أقل')), wi.join('|'));
  // مخزون
  assert.deepStrictEqual(R.lowStock([{name:'NPK', quantity:2, minQty:5, unit:'كجم'}, {name:'OK', quantity:9, minQty:5}, {name:'بدون حد', quantity:1}]), ['NPK (2 كجم ≤ 5)']);

  // تشغيل كامل
  const data = {
    'settings/systems': {list: systems}, 'settings/users': {list: users},
    ['readings/' + R.rid('irrigation','S1',yest)]: {entries:[{ts:'2026-11-05T08:00', ph:6.0, ec:2.0, temp:24}]},
    ['readings/' + R.rid('irrigation','S1',today)]: {entries:[{ts:'2026-11-06T08:00', ph:7.1, ec:2.0, temp:24}]},
    ['readings/tasks_' + today]: {date: today, entries:[{title:'ري', status:'pending', assignedEmail:'ali@x.com'}]},
    'inventory/i1': {name:'NPK', quantity:2, minQty:5, unit:'كجم'},
    'pushTokens/ta': {token:'ta', email:'admin@x.com'}, 'pushTokens/tl': {token:'tl', email:'ali@x.com'}, 'pushTokens/to': {token:'to', email:'omar@x.com'}
  };
  const sent = [];
  const messaging = {sendEachForMulticast: async (m) => { sent.push(m); return {successCount: m.tokens.length, failureCount: 0, responses: m.tokens.map(() => ({}))}; }};
  // قبل ميعاد الملخص والفحص: مفيش حاجة
  let r = await R.runDaily({db: fakeDb(data), messaging, now: {date: today, hour: 6}, cfg});
  assert.deepStrictEqual(r, {digest:0, missing:0}); assert.strictEqual(sent.length, 0);
  // الساعة 12: الاتنين
  r = await R.runDaily({db: fakeDb(data), messaging, now: {date: today, hour: 12}, cfg});
  const byTag = t => sent.filter(m => m.data.tag === t);
  assert.ok(byTag('oroots-missing').length >= 2, 'ناقص: المدير + عمر (التربة) + المناخ');
  const adminMissing = byTag('oroots-missing').find(m => m.tokens[0] === 'ta');
  assert.ok(adminMissing.data.body.includes('T1') && adminMissing.data.body.includes('TG'));
  const aliDigest = byTag('oroots-digest').find(m => m.tokens[0] === 'tl');
  assert.ok(aliDigest && aliDigest.data.body.includes('pH الري 7.1') && aliDigest.data.body.includes('مهام معلّقة: 1') && !aliDigest.data.body.includes('مخزون'), 'علي: مياه + مهام من غير مخزون');
  const omarDigest = byTag('oroots-digest').find(m => m.tokens[0] === 'to');
  assert.ok(omarDigest && omarDigest.data.body.includes('مخزون منخفض') && !omarDigest.data.body.includes('pH الري'), 'عمر: مخزون بس');
  assert.ok(!byTag('oroots-digest').some(m => m.tokens.includes('tv')), 'مشاهد من غير جهاز/صلاحية');
  assert.strictEqual(data['settings/reminderState'].digestDate, today); assert.strictEqual(data['settings/reminderState'].missingDate, today);
  // تاني في نفس اليوم: مفيش تكرار
  sent.length = 0; r = await R.runDaily({db: fakeDb(data), messaging, now: {date: today, hour: 13}, cfg});
  assert.strictEqual(sent.length, 0);
  // إيقاف من الإعدادات
  const data2 = Object.assign({}, data); delete data2['settings/reminderState'];
  r = await R.runDaily({db: fakeDb(data2), messaging, now: {date: today, hour: 13}, cfg: Object.assign({digestOn:false, checkOn:false}, cfg)});
  assert.strictEqual(sent.length, 0);
  // طقس
  const wxd = {time:['2026-11-06','2026-11-07','2026-11-08'], temperature_2m_max:[40,30,25], temperature_2m_min:[20,5,18], wind_speed_10m_max:[3,16,2], precipitation_sum:[0,0,6], precipitation_probability_max:[0,0,80]};
  const wa = R.weatherAlerts(wxd, {});
  assert.ok(wa.some(l => l.includes('حر') && l.includes('النهارده')) && wa.some(l => l.includes('برد') && l.includes('بكرة')) && wa.some(l => l.includes('رياح')) && wa.some(l => l.includes('مطر')), wa.join('|'));
  assert.deepStrictEqual(R.weatherAlerts(wxd, {wxHeat: 45, wxCold: 0, wxWind: 30}).filter(l => !l.includes('مطر')), []);
  const data3 = Object.assign({}, data); delete data3['settings/reminderState']; sent.length = 0;
  await R.runDaily({db: fakeDb(data3), messaging, now: {date: today, hour: 12}, cfg: Object.assign({weatherLat: 28, weatherLon: 33}, cfg), fetchJson: async () => ({daily: wxd})});
  assert.ok(sent.filter(m => m.data.tag === 'oroots-digest').every(m => m.data.body.includes('موجة حر')), 'الطقس في كل الملخصات');
  // رؤى: مخاطر أمراض + قراءات شاذة تدخل الملخص
  const NOWTS = '2026-11-06T12:00', ins = {}; const hrs = [20, 17, 14, 11, 8];
  ins['readings/' + R.rid('climate', 'LG1', today)] = {entries: hrs.map(h => ({ts: new Date(Date.parse(NOWTS + ':00Z') - h*3600000).toISOString().slice(0, 16), temp: 18, rh: 94}))};
  const insights = R.farmInsights(systems, new Map(Object.keys(ins).map(k => [k.replace('readings/', ''), ins[k]])), today, NOWTS);
  assert.ok(insights.some(x => x.tab === 'climate' && x.text.includes('العفن الرمادي')), JSON.stringify(insights));
  const data4 = Object.assign({}, data, ins); delete data4['settings/reminderState']; sent.length = 0;
  await R.runDaily({db: fakeDb(data4), messaging, now: {date: today, hour: 12, ts: NOWTS}, cfg});
  const adminD = sent.find(m => m.data.tag === 'oroots-digest' && m.tokens[0] === 'ta');
  assert.ok(adminD && adminD.data.body.includes('العفن الرمادي'), 'المدير بيتبعتله خطر الأمراض');
  // عتبات الأمراض من الإعدادات بتتطبق على السيرفر
  const off = R.farmInsights(systems, new Map(Object.keys(ins).map(k => [k.replace('readings/', ''), ins[k]])), today, NOWTS, {disease: {botrytis: {on: false}, downy: {on: false}}});
  assert.ok(!off.some(x => x.text.includes('العفن الرمادي') || x.text.includes('الزغبي')), JSON.stringify(off));
  console.log('✓ كل الاختبارات نجحت');
})().catch(e => { console.error('✗', e.stack); process.exit(1); });
