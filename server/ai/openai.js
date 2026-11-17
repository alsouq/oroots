/* O'Roots — المحلّل الذكي: أي مزوّد بواجهة OpenAI-compatible (Chat Completions):
   - محلي على كمبيوتر المزرعة: Ollama (http://127.0.0.1:11434/v1) أو LM Studio (http://127.0.0.1:1234/v1)
   - ChatGPT (https://api.openai.com/v1)
   - أي مزوّد تاني بنفس الواجهة (مثلاً Gemini أو DeepSeek أو Groq) */
'use strict';

/* o: {baseUrl, apiKey, model, system, user, timeoutMs} → {text, model, usage, stop} */
async function generate(o){
  const url = String(o.baseUrl || '').replace(/\/+$/, '') + '/chat/completions';
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), o.timeoutMs || 30 * 60 * 1000);   // النموذج المحلي على معالج عادي ممكن ياخد دقايق
  const headers = {'Content-Type': 'application/json'};
  if(o.apiKey) headers.Authorization = 'Bearer ' + o.apiKey;
  let r, raw = '', j = null;
  try{
    r = await fetch(url, {method: 'POST', headers, signal: ctl.signal, body: JSON.stringify({
      model: o.model, stream: false,
      messages: [{role: 'system', content: o.system}, {role: 'user', content: o.user}]
    })});
    raw = await r.text();
  }catch(e){
    if(e.name === 'AbortError') throw Object.assign(new Error('timeout'), {code: 'timeout'});
    throw Object.assign(new Error(e.message || 'network'), {code: 'network'});
  }finally{ clearTimeout(timer); }
  try{ j = JSON.parse(raw); }catch(e){}
  if(!r.ok){
    const m = (j && j.error && (j.error.message || j.error)) || ('HTTP ' + r.status);
    const code = (r.status === 401 || r.status === 403) ? 'auth' : r.status === 429 ? 'rate' : r.status === 404 ? 'model' : r.status === 400 ? 'bad-request' : 'http';
    throw Object.assign(new Error(String(m).slice(0, 300)), {code, status: r.status});
  }
  const c = j && j.choices && j.choices[0];
  let text = String((c && c.message && c.message.content) || '');
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();   // نماذج التفكير المحلية بترجع تفكيرها جوه <think>
  if(!text) throw Object.assign(new Error('رد فاضي من النموذج'), {code: 'empty'});
  return {
    text, model: (j && j.model) || o.model, stop: c && c.finish_reason,
    usage: j && j.usage ? {input: j.usage.prompt_tokens, output: j.usage.completion_tokens} : null
  };
}
module.exports = {generate};
