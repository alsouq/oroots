/* سيرفر SMTP وهمي للاختبارات: بيستقبل الإيميلات ويحطها في mails (من غير تشفير، فالإعداد لازم فيه allowInsecure). */
'use strict';
const net = require('net');
function fakeSmtp(){
  const mails = [];
  const srv = net.createServer(sock => {
    let buf = '', data = null, cur = {};
    sock.write('220 fake ESMTP\r\n');
    sock.on('data', d => {
      buf += d.toString('utf8');
      for(;;){
        if(data !== null){ const i = buf.indexOf('\r\n.\r\n'); if(i < 0) return; cur.data = buf.slice(0, i); buf = buf.slice(i + 5); data = null; mails.push(cur); cur = {}; sock.write('250 queued\r\n'); continue; }
        const i = buf.indexOf('\r\n'); if(i < 0) return; const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if(/^EHLO/i.test(line)) sock.write('250-fake\r\n250 AUTH PLAIN\r\n');
        else if(/^AUTH PLAIN/i.test(line)){ cur.auth = Buffer.from(line.slice(11), 'base64').toString('utf8'); sock.write('235 ok\r\n'); }
        else if(/^MAIL FROM/i.test(line)){ cur.from = line; sock.write('250 ok\r\n'); }
        else if(/^RCPT TO/i.test(line)){ cur.to = line; sock.write('250 ok\r\n'); }
        else if(/^DATA/i.test(line)){ data = ''; sock.write('354 go\r\n'); }
        else if(/^QUIT/i.test(line)){ sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('500 ?\r\n');
      }
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({srv, mails, port: srv.address().port})));
}
module.exports = {fakeSmtp};
