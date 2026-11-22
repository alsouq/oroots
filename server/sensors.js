/* O'Roots — استقبال قراءات الحساسات (ESP32) على السيرفر المحلي.
   - بيفتح بورت لوحده (8787) على شبكة المزرعة. رابط Tailscale بيوصل للتطبيق (8080) بس، فالحساسات مش ظاهرة على الإنترنت.
   - نفس منطق بوابة الحساسات (sensors/sensor-gateway.js): كلمة سر، رفض القيم المستحيلة، قراءة كل X دقيقة لكل حساس،
     والقراءة بتتسجّل زي القراءة اليدوية (readings/climate_<الصوبة>_<التاريخ> ...) فبتظهر في كل حتة في التطبيق على طول.
   - بيحفظ حالة كل حساس (آخر مرة بعت، آخر قيم، آخر خطأ) عشان كارت «الحساسات» في الإعدادات وتنبيه «حساس واقف».
   الإعداد في config.json:
     "sensors": {"apiKey": "كلمة-سر-طويلة", "devices": {"lg1-climate": {"type": "climate", "greenhouse": "LG1"}}} */
'use strict';
const os = require('os'), path = require('path');
const {adminDb} = require('./admin-adapter');
const G = require(path.join(__dirname, '..', 'sensors', 'sensor-gateway.js'));

const VALUE_KEYS = ['temp', 'rh', 'lux', 'ph', 'ec'];
const num = (v, d) => { const n = Number(v); return isFinite(n) && n > 0 ? n : d; };

/* قسم sensors من config.json ← إعدادات جاهزة (أو null لو مفيش حساسات) */
function sensorsCfg(cfg){
  const s = cfg && cfg.sensors;
  if(!s || !s.devices || !Object.keys(s.devices).length) return null;
  const c = G.loadConfig({devices: s.devices});
  return {devices: c.devices, apiKey: String(s.apiKey || ''), host: s.host || '0.0.0.0', port: s.port === 0 ? 0 : num(s.port, 8787),
    minIntervalMin: num(s.minIntervalMin, 10), maxWritesPerDay: num(s.maxWritesPerDay, 20000), silentMin: num(s.silentMin, 60)};
}
const keyOk = k => k.length >= 16 && !/^(change|write|your|xxx|اكتب|غيّر|غير)/i.test(k);

/* العناوين اللي الحساس يبعت عليها (عنوان الكمبيوتر في شبكة المزرعة) */
function lanUrls(port){
  const out = [];
  Object.values(os.networkInterfaces()).forEach(list => (list || []).forEach(a => {
    if((a.family === 'IPv4' || a.family === 4) && !a.internal && !/^169\.254\./.test(a.address) && !/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a.address)) out.push('http://' + a.address + ':' + port + '/ingest');   // من غير عناوين Tailscale
  }));
  return out;
}

function start(app, opts){
  const {store, cfg, hooks} = app;
  hooks.sensorsErr = '';
  let sc;
  try{ sc = sensorsCfg(cfg); }catch(e){ hooks.sensorsErr = 'config: ' + e.message; console.error('قسم sensors في config.json فيه غلطة: ' + e.message); return null; }
  if(!sc) return null;
  if(!keyOk(sc.apiKey)){ hooks.sensorsErr = 'apiKey'; console.error('الحساسات مش هتشتغل: اكتب apiKey في قسم sensors في config.json (16 حرف على الأقل)'); return null; }
  const st = Object.assign({devices: {}, unknown: {}, badKeyAt: 0}, store.kvGet('sensors:status') || {});
  const onEvent = ev => {
    const now = Date.now();
    if(ev.device && sc.devices[ev.device]){
      const s = st.devices[ev.device] || (st.devices[ev.device] = {});
      if(ev.ok){
        s.seen = now; s.error = '';
        if(ev.result && ev.result.saved){ s.savedAt = now; s.values = {}; VALUE_KEYS.forEach(k => { if(ev.body[k] != null && isFinite(Number(ev.body[k]))) s.values[k] = Math.round(Number(ev.body[k]) * 100) / 100; }); }
      } else { s.error = String(ev.error || '').slice(0, 120); s.errAt = now; }
    } else if(ev.device){
      st.unknown[String(ev.device).slice(0, 40)] = now;
      const ks = Object.keys(st.unknown).sort((a, b) => st.unknown[b] - st.unknown[a]); ks.slice(5).forEach(k => { delete st.unknown[k]; });
    } else if(ev.status === 401) st.badKeyAt = now;
    store.kvSet('sensors:status', st);
  };
  const server = G.createServer({db: adminDb(store), cfg: sc, apiKey: sc.apiKey, onEvent});
  server.on('error', e => {
    hooks.sensorsErr = e.code === 'EADDRINUSE' ? 'port' : e.message;
    console.error(e.code === 'EADDRINUSE' ? 'بورت الحساسات ' + sc.port + ' مستخدم — غيّر sensors.port في config.json' : 'الحساسات: ' + e.message);
  });
  hooks.sensors = {cfg: sc, server, status: st, startedAt: Date.now()};
  if(!opts || opts.listen !== false){
    server.listen(sc.port, sc.host, () => {
      const p = server.address().port;
      console.log('الحساسات: ' + Object.keys(sc.devices).length + ' جهاز — العنوان اللي يتكتب في الحساس: ' + (lanUrls(p)[0] || ('http://<عنوان-الكمبيوتر>:' + p + '/ingest')));
    });
  }
  return hooks.sensors;
}

/* الحساسات اللي ما بعتتش من أكتر من silentMin دقيقة (أو ما بعتتش خالص من ساعة ما السيرفر اشتغل) */
function silent(app, now){
  const S = app.hooks && app.hooks.sensors; if(!S) return [];
  now = now || Date.now();
  const lim = S.cfg.silentMin * 60000;
  return Object.keys(S.cfg.devices).filter(id => { const s = S.status.devices[id]; return now - ((s && s.seen) || S.startedAt) > lim; });
}

function routes({hooks, rules, send, need}){
  const deny = () => Object.assign(new Error('permission-denied'), {status: 403, code: 'permission-denied'});
  return {
    // كارت «الحساسات» في الإعدادات (المدير بس)
    'GET /api/sensors/status': async (req, res, b, u) => {
      need(u); if(!rules.isAdmin(u)) throw deny();
      const S = hooks.sensors;
      if(!S) return send(res, 200, {enabled: false, error: hooks.sensorsErr || ''});
      const now = Date.now(), lim = S.cfg.silentMin * 60000, port = S.server.address() ? S.server.address().port : S.cfg.port;
      const devices = Object.keys(S.cfg.devices).map(id => {
        const d = S.cfg.devices[id], s = S.status.devices[id] || {};
        return {id, type: d.type, greenhouse: d.greenhouse || '', systemId: d.systemId || '', source: d.type === 'water' ? (d.source || 'irrigation') : '',
          seen: s.seen || 0, savedAt: s.savedAt || 0, values: s.values || null, error: s.error || '', errAt: s.errAt || 0,
          silent: now - (s.seen || S.startedAt) > lim};
      });
      send(res, 200, {enabled: true, error: hooks.sensorsErr || '', port, urls: lanUrls(port), minIntervalMin: S.cfg.minIntervalMin, silentMin: S.cfg.silentMin,
        devices, unknown: Object.keys(S.status.unknown).map(k => ({id: k, at: S.status.unknown[k]})), badKeyAt: S.status.badKeyAt || 0, now});
    }
  };
}

module.exports = {start, silent, routes, sensorsCfg, lanUrls};
