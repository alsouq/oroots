/* O'Roots — حسابات السيرفر المحلي: إيميل + كلمة سر (scrypt) + جلسات (توكن عشوائي). */
'use strict';
const crypto = require('crypto');
const SESSION_DAYS = 60;

function hashPw(pw, salt){ return crypto.scryptSync(String(pw), salt, 32, {N: 16384, r: 8, p: 1}).toString('hex'); }
function randomPw(){ const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; const b = crypto.randomBytes(10); for(const x of b) s += a[x % a.length]; return s; }

class Auth {
  constructor(store){
    this.store = store; const db = store.db;
    db.exec("CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL, mustChange INTEGER DEFAULT 0);" +
      "CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, email TEXT NOT NULL, created INTEGER NOT NULL, seen INTEGER NOT NULL);" +
      "CREATE TABLE IF NOT EXISTS resets (hash TEXT PRIMARY KEY, email TEXT NOT NULL, created INTEGER NOT NULL);");
    this.asks = new Map();    // طلبات «نسيت كلمة المرور»: مفتاح (إيميل أو عنوان) → أوقات الطلبات في آخر ساعة
    this.fails = new Map();   // حماية من تخمين كلمة السر: email|ip → {n, until}
  }
  norm(e){ return String(e || '').trim().toLowerCase(); }
  exists(email){ return !!this.store.db.prepare('SELECT 1 FROM users WHERE email = ?').get(this.norm(email)); }
  list(){ return this.store.db.prepare('SELECT email, created, mustChange FROM users ORDER BY email').all(); }
  setPassword(email, pw, mustChange){
    email = this.norm(email);
    if(!/^[^@\s]+@[^@\s]+$/.test(email)) throw Object.assign(new Error('auth/invalid-email'), {status: 400, code: 'auth/invalid-email'});
    if(String(pw || '').length < 6) throw Object.assign(new Error('auth/weak-password'), {status: 400, code: 'auth/weak-password'});
    const salt = crypto.randomBytes(16).toString('hex');
    this.store.db.prepare('INSERT INTO users (email, salt, hash, created, mustChange) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET salt = excluded.salt, hash = excluded.hash, mustChange = excluded.mustChange')
      .run(email, salt, hashPw(pw, salt), Date.now(), mustChange ? 1 : 0);
    this.store.db.prepare('DELETE FROM sessions WHERE email = ?').run(email);   // تغيير كلمة السر بيخرج كل الأجهزة
  }
  create(email, pw){
    if(this.exists(email)) throw Object.assign(new Error('auth/email-already-in-use'), {status: 409, code: 'auth/email-already-in-use'});
    this.setPassword(email, pw, true);
  }
  remove(email){ email = this.norm(email); this.store.db.prepare('DELETE FROM users WHERE email = ?').run(email); this.store.db.prepare('DELETE FROM sessions WHERE email = ?').run(email); }
  login(email, pw, ip){
    email = this.norm(email); const key = email + '|' + (ip || ''), f = this.fails.get(key), t = Date.now();
    if(f && f.until > t) throw Object.assign(new Error('auth/too-many-requests'), {status: 429, code: 'auth/too-many-requests'});
    const u = this.store.db.prepare('SELECT salt, hash, mustChange FROM users WHERE email = ?').get(email);
    const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(pw, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
    if(!ok){
      const fresh = f && t - f.first < 15 * 60000, n = (fresh ? f.n : 0) + 1;   // 5 محاولات غلط في ربع ساعة ⇒ إيقاف 5 دقايق
      this.fails.set(key, {n, first: fresh ? f.first : t, until: n >= 5 ? t + 5 * 60000 : 0});
      throw Object.assign(new Error('auth/invalid-credential'), {status: 401, code: 'auth/invalid-credential'});
    }
    this.fails.delete(key);
    const token = crypto.randomBytes(32).toString('base64url');
    this.store.db.prepare('INSERT INTO sessions (token, email, created, seen) VALUES (?, ?, ?, ?)').run(token, email, t, t);
    return {token, email, mustChange: !!u.mustChange};
  }
  check(token){
    if(!token) return null;
    const s = this.store.db.prepare('SELECT email, created, seen FROM sessions WHERE token = ?').get(String(token));
    if(!s) return null;
    const t = Date.now();
    if(t - s.seen > SESSION_DAYS * 86400000){ this.logout(token); return null; }
    if(t - s.seen > 3600000) this.store.db.prepare('UPDATE sessions SET seen = ? WHERE token = ?').run(t, String(token));
    return {email: s.email};
  }
  /* «نسيت كلمة المرور»: بنطلع توكن عشوائي (بيتخزّن مبعثر بس)، صالح ساعة ولمرة واحدة، وطلب جديد بيلغي القديم */
  askLimit(key, max){
    const t = Date.now(), list = (this.asks.get(key) || []).filter(x => t - x < 3600000);
    if(list.length >= max){ this.asks.set(key, list); return false; }
    list.push(t); this.asks.set(key, list); if(this.asks.size > 5000) this.asks.clear(); return true;
  }
  createReset(email){
    email = this.norm(email); const token = crypto.randomBytes(32).toString('base64url');
    this.store.db.prepare('DELETE FROM resets WHERE email = ? OR created < ?').run(email, Date.now() - 3600000);
    this.store.db.prepare('INSERT INTO resets (hash, email, created) VALUES (?, ?, ?)').run(crypto.createHash('sha256').update(token).digest('hex'), email, Date.now());
    return token;
  }
  useReset(token, pw){
    const h = crypto.createHash('sha256').update(String(token || '')).digest('hex'), r = this.store.db.prepare('SELECT email, created FROM resets WHERE hash = ?').get(h);
    if(!r || Date.now() - r.created > 3600000) throw Object.assign(new Error('auth/invalid-reset'), {status: 400, code: 'auth/invalid-reset'});
    this.setPassword(r.email, pw, false);
    this.store.db.prepare('DELETE FROM resets WHERE email = ?').run(r.email);
    return r.email;
  }
  mustChange(email){ const r = this.store.db.prepare('SELECT mustChange FROM users WHERE email = ?').get(this.norm(email)); return !!(r && r.mustChange); }
    logout(token){ this.store.db.prepare('DELETE FROM sessions WHERE token = ?').run(String(token || '')); }
}
module.exports = {Auth, randomPw};
