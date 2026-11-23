/* O'Roots — إرسال إيميل بسيط (SMTP) من غير أي مكتبة. بنستخدمه لرابط «نسيت كلمة المرور».
   جيميل: host smtp.gmail.com و port 465 (TLS) أو 587 (STARTTLS) + «كلمة مرور التطبيقات» (App Password) مش كلمة سر الحساب.
   الإعداد في config.json: "mail": {"host": "smtp.gmail.com", "port": 465, "user": "you@gmail.com", "pass": "xxxx xxxx xxxx xxxx", "from": "O'Roots <you@gmail.com>"} */
'use strict';
const net = require('net'), tls = require('tls'), os = require('os');

function configured(m){ return !!(m && m.host && m.user && m.pass); }

function b64lines(s){ return Buffer.from(String(s), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'); }
function encHeader(s){ return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?='; }
function addr(s){ const m = /<([^>]+)>/.exec(String(s)); return (m ? m[1] : String(s)).trim(); }

/* الرسالة نفسها (UTF-8 + base64 عشان العربي يوصل سليم) */
function build(m, to, subject, text){
  const from = m.from || m.user, id = '<' + Date.now().toString(36) + Math.random().toString(36).slice(2) + '@' + (os.hostname() || 'oroots') + '>';
  return ['From: ' + (/[^\x20-\x7e]/.test(from) ? encHeader(from) : from), 'To: ' + to, 'Subject: ' + encHeader(subject), 'Date: ' + new Date().toUTCString(), 'Message-ID: ' + id,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64lines(text)].join('\r\n');
}

function send(m, o){
  return new Promise((resolve, reject) => {
    if(!configured(m)) return reject(Object.assign(new Error('mail not configured'), {code: 'mail-not-configured'}));
    const port = Number(m.port) || 465, secure = m.secure != null ? !!m.secure : port === 465;
    let sock = null, buf = '', waiting = null, done = false, upgraded = secure;
    const fail = e => { if(done) return; done = true; try{ sock && sock.destroy(); }catch(x){} reject(e instanceof Error ? e : new Error(String(e))); };
    const timer = setTimeout(() => fail(new Error('smtp timeout')), 25000);
    const finish = () => { if(done) return; done = true; clearTimeout(timer); try{ sock.end(); }catch(x){} resolve(true); };
    /* ردود SMTP: سطر أو أكتر، وآخر سطر بيكون «123 ...» من غير شرطة */
    const onData = d => {
      buf += d.toString('utf8');
      for(;;){
        const lines = buf.split('\r\n'); if(lines.length < 2) return;
        let end = -1; for(let i = 0; i < lines.length - 1; i++){ if(/^\d{3} /.test(lines[i]) || /^\d{3}$/.test(lines[i])){ end = i; break; } }
        if(end < 0) return;
        const reply = lines.slice(0, end + 1); buf = lines.slice(end + 1).join('\r\n');
        if(waiting){ const w = waiting; waiting = null; w(parseInt(reply[0].slice(0, 3), 10), reply.join('\n')); }
      }
    };
    const read = () => new Promise(r => { waiting = (code, text) => r({code, text}); });
    const cmd = async (line, ok) => {
      sock.write(line + '\r\n'); const r = await read();
      if(ok.indexOf(r.code) < 0) throw new Error('smtp ' + r.code + ' after ' + line.split(' ')[0] + ': ' + r.text.slice(0, 120));
      return r;
    };
    const run = async () => {
      let r = await read(); if(r.code !== 220) throw new Error('smtp greeting ' + r.code);
      const helo = os.hostname() ? String(os.hostname()).replace(/[^\w.-]/g, '') || 'oroots' : 'oroots';
      r = await cmd('EHLO ' + helo, [250]);
      if(!upgraded && /STARTTLS/i.test(r.text)){
        await cmd('STARTTLS', [220]);
        sock.removeListener('data', onData);
        sock = tls.connect({socket: sock, servername: m.host}); sock.on('data', onData); sock.on('error', fail);
        await new Promise((ok, no) => { sock.once('secureConnect', ok); sock.once('error', no); });
        upgraded = true; r = await cmd('EHLO ' + helo, [250]);
      }
      if(!upgraded && !m.allowInsecure) throw new Error('smtp connection is not encrypted (set port 465/587, or allowInsecure for a local test server)');
      await cmd('AUTH PLAIN ' + Buffer.from('\0' + m.user + '\0' + m.pass, 'utf8').toString('base64'), [235]);
      await cmd('MAIL FROM:<' + addr(m.from || m.user) + '>', [250]);
      await cmd('RCPT TO:<' + addr(o.to) + '>', [250, 251]);
      await cmd('DATA', [354]);
      const body = build(m, o.to, o.subject, o.text).replace(/^\./gm, '..');
      await cmd(body + '\r\n.', [250]);
      try{ sock.write('QUIT\r\n'); }catch(x){}
      finish();
    };
    const start = () => { sock.on('data', onData); sock.on('error', fail); sock.on('close', () => { if(!done) fail(new Error('smtp closed')); }); run().catch(fail); };
    if(secure){ sock = tls.connect({host: m.host, port, servername: m.host}, start); }
    else { sock = net.connect({host: m.host, port}, start); }
    sock.setTimeout(25000, () => fail(new Error('smtp timeout')));
  });
}
module.exports = {send, configured, build};
