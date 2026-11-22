/* O'Roots — صلاحيات السيرفر المحلي: نفس منطق firestore.rules بالظبط، مكتوب JavaScript.
   auth = {email} أو null. store = المخزن (عشان نقرا roles/<email>). */
'use strict';
const FARM_COLLS = ['sops', 'fertilizers', 'targetProfiles', 'nutrientRecipes', 'pestlog', 'bioReleases', 'stickyTraps', 'pheromoneTraps', 'nursery', 'irrigCalib', 'inventory', 'harvest',
  'instrumentCalibrations', 'nurseryPlanLog', 'sprayPlan', 'qualityOrders', 'qualitySorting', 'qualityComplaints', 'qualityPhotos', 'plantGrowth', 'irrigSchedules', 'costs', 'tankLog', 'waterFills', 'pipeSnaps', 'nurseryHandovers'];
const COLL_TAB = {sops: 'tasks', fertilizers: 'nutrients', targetProfiles: 'nutrients', nutrientRecipes: 'nutrients', pestlog: 'pests', bioReleases: 'pests', stickyTraps: 'pests', pheromoneTraps: 'pests',
  nursery: 'nursery', nurseryPlanLog: 'nursery', irrigCalib: 'water', instrumentCalibrations: 'water', irrigSchedules: 'water', inventory: 'inventory', costs: 'inventory', tankLog: 'nutrients',
  plantGrowth: 'growth', qualityOrders: 'quality', qualitySorting: 'quality', qualityComplaints: 'quality', qualityPhotos: 'quality', waterFills: 'water'};

/* ملاحظات على السجلات: كل ملاحظة بتتربط بسجل (coll + targetId) وبتتحدد بتاب السجل: اللي له صلاحية «عرض» على التاب يكتب ملاحظة من غير ما يعدّل السجل */
const NOTE_TAB = {harvest: 'harvest', nursery: 'nursery', nurseryHandovers: 'nursery', qualityOrders: 'quality', qualitySorting: 'quality', qualityComplaints: 'quality', pestlog: 'pests', sprayPlan: 'spray',
  waterFills: 'water', tankLog: 'nutrients', sops: 'tasks', bioReleases: 'pests', plantGrowth: 'growth', inventory: 'inventory', irrigCalib: 'water'};
/* المستويات: operator (مشغّل) < user (مستخدم) < supervisor (مشرف) < admin (مدير عام). السجلات اللي بتتعدّل بس من صاحبها لو مش مشرف: */
const OWN_COLLS = ['harvest', 'waterFills', 'tankLog', 'qualityComplaints', 'qualitySorting'];
const DAY_MS = 86400000;

function makeRules(store, bootstrapAdmin){
  const boot = String(bootstrapAdmin || '').toLowerCase();
  const mail = a => a && a.email ? String(a.email).toLowerCase() : '';
  const roleDoc = a => { const d = store.get('roles/' + mail(a)); return d ? d.data : null; };
  const hasProfile = a => !!mail(a) && (mail(a) === boot || !!roleDoc(a));
  const isAdmin = a => !!mail(a) && (mail(a) === boot || ((roleDoc(a) || {}).role === 'admin'));
  const legacy = a => { const r = roleDoc(a); return !!r && !('perms' in r); };
  const perm = (a, tab, dflt) => { const r = roleDoc(a) || {}, p = r.perms || {}; return tab in p ? p[tab] : dflt; };
  const canEditTab = (a, tab) => isAdmin(a) || (hasProfile(a) && (legacy(a) || perm(a, tab, 'none') === 'edit'));
  const levelOf = a => isAdmin(a) ? 'admin' : (((roleDoc(a) || {}).level) || 'user');
  const isSup = a => isAdmin(a) || levelOf(a) === 'supervisor';
  const canViewTab = (a, tab) => isAdmin(a) || (hasProfile(a) && (legacy(a) || ['view', 'edit'].indexOf(perm(a, tab, 'none')) >= 0));
  const authorOf = r => String((r && (r.by || r.createdBy)) || '').trim().toLowerCase();
  /* المستخدم بيعدّل سجله هو، والمشغّل سجله هو وخلال 24 ساعة بس، والمشرف كله */
  const ownEditOk = (a, r) => isSup(a) || (authorOf(r) === mail(a) && (levelOf(a) !== 'operator' || Date.now() - (Number(r.createdAt) || 0) < DAY_MS));
  const canEditSoil = a => isAdmin(a) || (hasProfile(a) && (legacy(a) || perm(a, 'soil', perm(a, 'water', 'none')) === 'edit'));
  const canWriteColl = (a, c) => (c === 'harvest' && (canEditTab(a, 'harvest') || canEditTab(a, 'nursery'))) || (c === 'qualityPhotos' && canEditTab(a, 'pests')) || (!!COLL_TAB[c] && canEditTab(a, COLL_TAB[c]));
  const canWriteReading = (a, src) => src === 'tasks' || (['irrigation', 'drainage', 'tank'].indexOf(src) >= 0 && canEditTab(a, 'water')) || (src === 'soil' && canEditSoil(a)) || (src === 'climate' && canEditTab(a, 'climate'));
  /* خطة الرش: التعديل لصاحب صلاحية الرش أو المكافحة. المكلّف يقدر يعلّم "اتنفّذ" بس. */
  const canSpray = a => canEditTab(a, 'spray') || canEditTab(a, 'pests');
  const SPRAY_SOP = 'رش وتسميد';
  const low = v => String(v == null ? '' : v).trim().toLowerCase();
  const myName = a => { const d = store.get('settings/users'), l = d && Array.isArray(d.data.list) ? d.data.list : [];
    const u = l.filter(x => low(x.username) === mail(a))[0]; return u ? low(u.displayName) : ''; };
  /* نفس منطق isMyTask في التطبيق */
  const taskMine = (a, t) => !!t && (low(t.assignedEmail) === mail(a) || low(t.assignedTo) === mail(a) || (!!myName(a) && low(t.assignedTo) === myName(a)));
  const byId = l => { const m = new Map(); (Array.isArray(l) ? l : []).forEach(e => { if(e && e.id != null) m.set(String(e.id), e); }); return m; };
  /* المهام: صاحب صلاحية المهام يعدّل كل حاجة. غيره: يخلّص/يرجّع مهمته هو وقايمة الفحص بتاعتها،
     ويضيف مهمة باسمه (المتكررة)، وصاحب الرش/المكافحة/الجودة يضيف مهام للناس، وصاحب الرش يقفل أو يشيل مهمة رش. */
  function canWriteTasks(a, r, d){
    if(canEditTab(a, 'tasks')) return true;
    if(changedKeys(r, d).some(k => k !== 'entries' && (r[k] != null || ['source', 'date'].indexOf(k) < 0))) return false;
    const b = byId(r.entries), n = byId(d.entries);
    if(Array.isArray(d.entries) && n.size !== d.entries.length) return false;
    for(const [id, e] of b){
      if(n.has(id)) continue;
      if(!(canSpray(a) && e.sopTitle === SPRAY_SOP)) return false;
    }
    for(const [id, e] of n){
      const o = b.get(id);
      if(!o){
        if(e.status !== 'pending' || low(e.createdBy) !== mail(a)) return false;
        if(!(taskMine(a, e) || low(e.coverFor) === mail(a) || canSpray(a) || canEditTab(a, 'quality'))) return false;
        continue;
      }
      const ch = changedKeys(o, e);
      if(!ch.length) continue;
      const okMine = taskMine(a, o) && ch.every(k => ['status', 'completedAt', 'checklist'].indexOf(k) >= 0) &&
        (!ch.includes('checklist') || (Array.isArray(e.checklist) && Array.isArray(o.checklist) && e.checklist.length === o.checklist.length && e.checklist.every((x, i) => x && o.checklist[i] && x.t === o.checklist[i].t)));
      const okSpray = canSpray(a) && o.sopTitle === SPRAY_SOP && ch.every(k => k === 'status' || k === 'completedAt');
      if(!okMine && !okSpray) return false;
    }
    return true;
  }
  /* قراءات مياه/مناخ/تربة لغير المشرف: يضيف قراءات باسمه، ويعدّل قراءته هو (المشغّل خلال 24 ساعة)، ومايمسحش قراءة */
  function entriesOwnOk(a, r, d){
    const b = byId(r.entries), n = byId(d.entries);
    if(Array.isArray(d.entries) && n.size !== d.entries.length) return false;
    for(const id of b.keys()) if(!n.has(id)) return false;
    for(const [id, e] of n){
      const o = b.get(id);
      if(!o){ if(low(e.by) !== mail(a)) return false; continue; }
      if(JSON.stringify(o) === JSON.stringify(e)) continue;
      if(!ownEditOk(a, {by: o.by, createdAt: o.createdAt})) return false;
    }
    return changedKeys(r, d).every(k => k === 'entries' || r[k] == null);
  }
  function canWriteSpray(a, del, create, r, d){
    if(canSpray(a)) return true;
    if(del || create) return false;
    const ch = changedKeys(r, d);
    return low(r.assignedEmail) === mail(a) && ch.length > 0 && ch.every(k => ['done', 'doneAt', 'doneBy'].indexOf(k) >= 0) && (!d.doneBy || low(d.doneBy) === mail(a));
  }
  /* المحلّل الذكي: المدير، أو موظف المدير فتحله الصلاحية صراحةً (الحسابات القديمة من غير perms ما بتاخدهاش) */
  const aiPerm = a => isAdmin(a) ? 'edit' : (hasProfile(a) && ['view', 'edit'].indexOf(perm(a, 'ai', 'none')) >= 0 ? perm(a, 'ai', 'none') : 'none');
  const isStr = v => typeof v === 'string';
  const isNum = v => typeof v === 'number' && isFinite(v);
  const size = v => (v == null ? 0 : (isStr(v) || Array.isArray(v) ? v.length : Object.keys(v).length));
  const changedKeys = (b, a) => { const ks = new Set(Object.keys(b || {}).concat(Object.keys(a || {}))); return [...ks].filter(k => JSON.stringify((b || {})[k]) !== JSON.stringify((a || {})[k])); };

  function canRead(a, coll, id, data){
    if(!mail(a)) return false;
    if(coll === 'roles') return isAdmin(a) || isSup(a) || mail(a) === String(id).toLowerCase();
    if(coll === 'settings'){ if(id === 'users' || id === 'cropNames') return hasProfile(a); return hasProfile(a); }
    if(coll === 'userData') return hasProfile(a) && mail(a) === String(id).toLowerCase();
    if(coll === 'auditLog') return isAdmin(a);
    if(coll === 'notifications') return hasProfile(a) && !!data && (String(data.to || '').toLowerCase() === mail(a) || isAdmin(a));
    if(coll === 'pushTokens') return false;
    if(coll === 'usageStats') return isAdmin(a);
    if(coll === 'trash') return isAdmin(a);
    if(coll === 'readings' || coll === 'handover') return hasProfile(a);
    if(coll === 'aiReports') return aiPerm(a) !== 'none';
    if(coll === 'recordNotes') return hasProfile(a) && !!data && !!NOTE_TAB[data.coll] && canViewTab(a, NOTE_TAB[data.coll]);
    return hasProfile(a) && FARM_COLLS.indexOf(coll) >= 0;
  }
  /* c = {op, coll, id, before, after} (after = null للحذف) */
  function canWrite(a, c){
    if(!mail(a)) return false;
    const create = c.before == null, del = c.after == null, d = c.after || {}, r = c.before || {};
    switch(c.coll){
      case 'roles': return isAdmin(a);
      case 'userData': return hasProfile(a) && mail(a) === String(c.id).toLowerCase();
      case 'auditLog': return create && !del && hasProfile(a) && d.user === mail(a) && (!('details' in d) || size(d.details) <= 1500);
      case 'notifications':
        if(del) return hasProfile(a) && (String(r.to || '').toLowerCase() === mail(a) || isAdmin(a));
        if(create) return hasProfile(a) && d.from === mail(a) && isStr(d.to) && !!store.get('roles/' + d.to.toLowerCase()) &&
          (!('title' in d) || size(d.title) <= 300) && (!('body' in d) || size(d.body) <= 2000);
        return hasProfile(a) && r.to === mail(a) && changedKeys(r, d).every(k => k === 'read' || k === 'readAt');
      case 'pushTokens':
        if(del) return hasProfile(a) && r.email === mail(a);
        if(create) return hasProfile(a) && d.email === mail(a);
        return hasProfile(a) && r.email === mail(a) && d.email === mail(a);
      case 'usageStats':
        if(del) return isAdmin(a);
        return hasProfile(a) && d.user === mail(a) && Object.keys(d).every(k => ['day', 'user', 'device', 'r', 'w', 'updatedAt'].indexOf(k) >= 0) &&
          isNum(d.r) && isNum(d.w) && (create || r.user === mail(a));
      case 'trash': return isAdmin(a);
      case 'recordNotes':   // ملاحظة على سجل: بتتكتب مرة (باسمك) ومفيش تعديل، والمشرف أو المدير بس يمسح
        if(del) return isSup(a);
        return create && hasProfile(a) && low(d.by) === mail(a) && !!NOTE_TAB[d.coll] && canViewTab(a, NOTE_TAB[d.coll]) && isStr(d.targetId) && size(d.targetId) > 0 && size(d.targetId) <= 200 &&
          isStr(d.text) && size(d.text.trim()) > 0 && size(d.text) <= 500;
      case 'aiReports': return del && isAdmin(a);   // السيرفر بس هو اللي بيكتب التقارير
      case 'settings':
        if(c.id === 'users' || c.id === 'cropNames') return isAdmin(a);
        return hasProfile(a) && (isAdmin(a) || (c.id === 'pipeMaps' && (canEditTab(a, 'harvest') || canEditTab(a, 'nursery'))) || (['nurseryPlans', 'nurseryTiles'].indexOf(c.id) >= 0 && canEditTab(a, 'nursery')) || (c.id === 'tankDims' && canEditTab(a, 'water')));
      case 'nurseryHandovers':   // جرد المشتل وتسليم/تسلم: بيتكتب مرة، والمستلم بس يعتمد أو يعترض، ومفيش تعديل بعد كده. الحذف للمدير.
        if(del) return isAdmin(a);
        if(!hasProfile(a)) return false;
        if(create) return canEditTab(a, 'nursery') && low(d.by) === mail(a) && !('toApprovedAt' in d) && !('toApprovedBy' in d) && (d.status === undefined || d.status === 'pending') && (d.status === undefined || !!d.toEmail);
        return r.status === 'pending' && !!r.toEmail && low(r.toEmail) === mail(a) && ['accepted', 'disputed'].indexOf(d.status) >= 0 && low(d.toApprovedBy) === mail(a) &&
          changedKeys(r, d).every(k => ['status', 'toApprovedAt', 'toApprovedBy', 'toNote'].indexOf(k) >= 0);
      case 'readings':
        if(del) return hasProfile(a) && (isAdmin(a) || (isSup(a) && canWriteReading(a, r.source)));
        if(!hasProfile(a) || !canWriteReading(a, d.source) || (!create && r.source !== d.source)) return false;
        if(d.source === 'tasks') return canWriteTasks(a, r, d);
        return isSup(a) || entriesOwnOk(a, r, d);
      case 'handover':
        if(del) return isSup(a);
        if(create) return hasProfile(a) && d.by === mail(a) && isStr(d.text) && size(d.text) <= 1000;
        {
          if(!changedKeys(r, d).every(k => k === 'ackBy') || !Array.isArray(d.ackBy)) return false;
          const before = new Set(r.ackBy || []), after = new Set(d.ackBy);
          const added = [...after].filter(x => !before.has(x)), removed = [...before].filter(x => !after.has(x));
          return hasProfile(a) && added.every(x => x === mail(a)) && removed.length === 0;
        }
      default:
        if(FARM_COLLS.indexOf(c.coll) < 0) return false;
        if(c.coll === 'sprayPlan') return hasProfile(a) && canWriteSpray(a, del, create, r, d);
        if(del) return hasProfile(a) && ((isSup(a) && canWriteColl(a, c.coll)) || (c.coll === 'qualityPhotos' && canWriteColl(a, c.coll)));
        if(!hasProfile(a) || !canWriteColl(a, c.coll)) return false;
        if((c.coll === 'costs' || c.coll === 'qualityOrders') && !isSup(a)) return false;   // التكاليف وفتح الأوردرات للمشرف أو المدير
        if(!create && OWN_COLLS.indexOf(c.coll) >= 0 && !ownEditOk(a, r)) return false;
        return true;
    }
  }
  return {canRead, canWrite, isAdmin, isSup, levelOf, hasProfile, aiPerm, canSpray};
}
module.exports = {makeRules, FARM_COLLS, NOTE_TAB, OWN_COLLS};
