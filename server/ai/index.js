/* O'Roots — المحلّل الذكي (المرحلة الأولى): إعدادات المزوّدين + تشغيل التحليل في الخلفية.
   - المزوّدين: محلي (الافتراضي) / Claude / ChatGPT / أي مزوّد تاني متوافق. المفاتيح على السيرفر بس.
   - التقرير بيتحفظ في aiReports وبيوصل للمتصفح بالتحديث اللحظي (يقدر ياخد دقايق مع النموذج المحلي).
   - الصلاحية: المدير، أو موظف المدير فتحله «المحلّل الذكي» (عرض = يشوف التقارير، تعديل = يشغّل تحليل). */
'use strict';
const crypto = require('crypto');
const prompts = require('./prompts');

const IDS = ['local', 'claude', 'chatgpt', 'custom'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const DEF = {
  default: 'local', perDay: 30,
  providers: {
    local: {kind: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', model: '', apiKey: ''},
    claude: {kind: 'anthropic', model: 'claude-opus-5-5', effort: 'high', apiKey: ''},
    chatgpt: {kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: '', apiKey: ''},
    custom: {kind: 'openai', baseUrl: '', model: '', apiKey: '', label: ''}
  }
};
const MAX_SNAPSHOT = 400 * 1024, MAX_RUNNING = 2;

function getCfg(store){
  const c = store.kvGet('ai:config') || {}, out = JSON.parse(JSON.stringify(DEF));
  if(IDS.indexOf(c.default) >= 0) out.default = c.default;
  if(c.perDay > 0) out.perDay = c.perDay;
  IDS.forEach(id => { Object.assign(out.providers[id], (c.providers || {})[id] || {}); out.providers[id].kind = DEF.providers[id].kind; });
  return out;
}
function ready(id, p){
  if(!p.model) return false;
  if(p.kind === 'anthropic') return !!p.apiKey;
  if(!/^https?:\/\//.test(p.baseUrl || '')) return false;
  return id === 'chatgpt' ? !!p.apiKey : true;   // المحلي ومزوّد على الشبكة ممكن يشتغلوا من غير مفتاح
}
function startOfDay(){ const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }

function routes(ctx){
  const {store, rules, send, need} = ctx;
  const deny = () => Object.assign(new Error('permission-denied'), {status: 403, code: 'permission-denied'});
  const bad = m => Object.assign(new Error(m), {status: 400, code: 'invalid-argument'});
  const level = u => (u && rules.aiPerm) ? rules.aiPerm(u) : 'none';
  const usedToday = () => store.query('aiReports', [{f: 'createdAt', op: '>=', v: startOfDay()}]).length;
  const running = () => store.query('aiReports', [{f: 'status', op: '==', v: 'running'}]).length;

  // لو السيرفر وقف وفيه تحليل شغّال: بيتعلّم إنه اتقطع
  try{
    const stuck = store.query('aiReports', [{f: 'status', op: '==', v: 'running'}]);
    if(stuck.length) store.commit(stuck.map(d => ({op: 'update', path: d.path, data: {status: 'error', error: 'interrupted', finishedAt: Date.now()}})));
  }catch(e){ console.error('aiReports cleanup', e.message); }

  function publicCfg(c, admin){
    return {
      default: c.default, perDay: c.perDay, usedToday: usedToday(),
      providers: IDS.map(id => {
        const p = c.providers[id], o = {id, kind: p.kind, model: p.model || '', label: p.label || '', ready: ready(id, p)};
        if(admin){ o.baseUrl = p.baseUrl || ''; o.hasKey = !!p.apiKey; o.keyHint = p.apiKey ? '…' + String(p.apiKey).slice(-4) : ''; if(p.kind === 'anthropic') o.effort = p.effort || 'high'; }
        return o;
      })
    };
  }
  async function generate(p, prompt, extra){
    const o = Object.assign({system: prompt.system, user: prompt.user, model: p.model, apiKey: p.apiKey, baseUrl: p.baseUrl, effort: p.effort}, extra || {});
    return p.kind === 'anthropic' ? require('./claude').generate(o) : require('./openai').generate(o);
  }

  return {
    'GET /api/ai/config': async (req, res, b, u) => {
      need(u); const lv = level(u); if(lv === 'none') throw deny();
      send(res, 200, publicCfg(getCfg(store), rules.isAdmin(u)));
    },
    'POST /api/ai/config': async (req, res, b, u) => {
      need(u); if(!rules.isAdmin(u)) throw deny();
      const cur = store.kvGet('ai:config') || {}, next = {default: cur.default, perDay: cur.perDay, providers: Object.assign({}, cur.providers || {})};
      if(b.default !== undefined){ if(IDS.indexOf(b.default) < 0) throw bad('default'); next.default = b.default; }
      if(b.perDay !== undefined){ const n = parseInt(b.perDay, 10); if(!(n >= 1 && n <= 500)) throw bad('perDay'); next.perDay = n; }
      IDS.forEach(id => {
        const inp = (b.providers || {})[id]; if(!inp) return;
        const p = Object.assign({}, next.providers[id] || {});
        if(inp.model !== undefined) p.model = String(inp.model).trim().slice(0, 120);
        if(inp.label !== undefined && id === 'custom') p.label = String(inp.label).trim().slice(0, 40);
        if(inp.baseUrl !== undefined && id !== 'claude'){
          const u2 = String(inp.baseUrl).trim();
          if(u2 && !/^https?:\/\/[^\s]+$/.test(u2)) throw bad('baseUrl');
          p.baseUrl = u2.slice(0, 300);
        }
        if(inp.effort !== undefined && id === 'claude'){ if(EFFORTS.indexOf(inp.effort) < 0) throw bad('effort'); p.effort = inp.effort; }
        if(inp.clearKey) p.apiKey = '';
        else if(typeof inp.apiKey === 'string' && inp.apiKey.trim()) p.apiKey = inp.apiKey.trim().slice(0, 400);
        next.providers[id] = p;
      });
      store.kvSet('ai:config', next);
      send(res, 200, publicCfg(getCfg(store), true));
    },
    'POST /api/ai/test': async (req, res, b, u) => {
      need(u); if(!rules.isAdmin(u)) throw deny();
      const c = getCfg(store), id = IDS.indexOf(b.provider) >= 0 ? b.provider : c.default, p = c.providers[id];
      if(!ready(id, p)) return send(res, 200, {ok: false, error: 'not-ready'});
      const t0 = Date.now();
      try{
        const r = await generate(p, {system: 'Reply with exactly one word: OK', user: 'Test'}, {maxTokens: 2000, effort: 'low', timeoutMs: 5 * 60 * 1000});
        send(res, 200, {ok: true, ms: Date.now() - t0, model: r.model, text: String(r.text).slice(0, 60)});
      }catch(e){ send(res, 200, {ok: false, error: e.code || 'error', detail: String(e.message || '').slice(0, 300)}); }
    },
    'POST /api/ai/run': async (req, res, b, u) => {
      need(u); if(level(u) !== 'edit') throw deny();
      if(prompts.KINDS.indexOf(b.kind) < 0) throw bad('kind');
      if(!b.snapshot || typeof b.snapshot !== 'object') throw bad('snapshot');
      if(JSON.stringify(b.snapshot).length > MAX_SNAPSHOT) throw bad('snapshot-too-large');
      const c = getCfg(store), id = IDS.indexOf(b.provider) >= 0 ? b.provider : c.default, p = c.providers[id];
      if(!ready(id, p)) return send(res, 409, {error: 'not-ready', message: id});
      if(usedToday() >= c.perDay) return send(res, 429, {error: 'daily-limit', message: String(c.perDay)});
      if(running() >= MAX_RUNNING) return send(res, 429, {error: 'busy', message: 'busy'});
      const docId = 'ai' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'), path = 'aiReports/' + docId;
      const lang = b.lang === 'en' ? 'en' : 'ar', question = b.question ? String(b.question).slice(0, 2000) : '';
      store.commit([{op: 'set', path, data: {
        kind: b.kind, title: String(b.title || '').slice(0, 120), lang, provider: id, model: p.model, status: 'running',
        by: u.email, createdAt: Date.now(), question, sent: b.snapshot
      }}]);
      send(res, 200, {id: docId});
      const t0 = Date.now();
      generate(p, prompts.build({kind: b.kind, lang, snapshot: b.snapshot, question})).then(r => {
        store.commit([{op: 'update', path, data: {status: 'done', text: r.text, servedModel: r.model || p.model, usage: r.usage || null, stop: r.stop || '', finishedAt: Date.now(), ms: Date.now() - t0}}]);
      }, e => {
        console.error('AI (' + id + '):', e.code || '', e.message);
        store.commit([{op: 'update', path, data: {status: 'error', error: e.code || 'error', detail: String(e.message || '').slice(0, 300), finishedAt: Date.now(), ms: Date.now() - t0}}]);
      });
    }
  };
}
module.exports = {routes, getCfg, ready, IDS};
