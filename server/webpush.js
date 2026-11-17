/* O'Roots — إرسال إشعارات Web Push للموبايل من غير أي مكتبة خارجية (VAPID + تشفير aes128gcm حسب RFC 8291 / 8292). */
'use strict';
const crypto = require('crypto'), https = require('https'), http = require('http');

const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/* مفاتيح VAPID (مرة واحدة وبتتحفظ): publicKey = نقطة P-256 خام (65 بايت) ، privateKey = d */
function generateVapid(){
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  return {publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey())};
}
function vapidKeyObject(v){
  const pub = fromB64u(v.publicKey);
  return crypto.createPrivateKey({key: {kty: 'EC', crv: 'P-256', d: v.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65))}, format: 'jwk'});
}
function vapidAuth(endpoint, v, subject){
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({typ: 'JWT', alg: 'ES256'})), body = b64u(JSON.stringify({aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject || 'mailto:admin@oroots.local'}));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), {key: vapidKeyObject(v), dsaEncoding: 'ieee-p1363'});
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + v.publicKey;
}
/* تشفير الرسالة لجهاز معيّن (sub.keys.p256dh + sub.keys.auth) */
function encrypt(sub, payload){
  const uaPublic = fromB64u(sub.keys.p256dh), authSecret = fromB64u(sub.keys.auth);
  const as = crypto.createECDH('prime256v1'); as.generateKeys();
  const asPublic = as.getPublicKey(), shared = as.computeSecret(uaPublic);
  const ikm = hmac(hmac(authSecret, shared), Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const salt = crypto.randomBytes(16), prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, ct]);
}
/* بيبعت؛ بيرجّع {status} (404/410 = الجهاز مش موجود تاني ⇒ يتمسح) */
function send(sub, payloadObj, v, opts){
  opts = opts || {};
  const body = encrypt(sub, JSON.stringify(payloadObj)), u = new URL(sub.endpoint), mod = u.protocol === 'http:' ? http : https;
  return new Promise(resolve => {
    const req = mod.request(u, {method: 'POST', timeout: 15000, headers: {
      'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm', 'Content-Length': body.length,
      TTL: String(opts.ttl || 86400), Urgency: opts.urgency || 'high', Authorization: vapidAuth(sub.endpoint, v, opts.subject)
    }}, res => { res.resume(); res.on('end', () => resolve({status: res.statusCode})); });
    req.on('timeout', () => { req.destroy(); resolve({status: 0, error: 'timeout'}); });
    req.on('error', e => resolve({status: 0, error: e.message}));
    req.end(body);
  });
}
module.exports = {generateVapid, vapidAuth, encrypt, send, b64u, fromB64u};
