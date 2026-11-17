/* O'Roots — المحلّل الذكي: Claude (Anthropic) بالمكتبة الرسمية @anthropic-ai/sdk.
   المفتاح بيتقري من إعدادات السيرفر بس (ما بيوصلش للمتصفح). */
'use strict';
let Anthropic = null;
function sdk(){
  if(!Anthropic){
    try{ Anthropic = require('@anthropic-ai/sdk').default; }
    catch(e){ throw Object.assign(new Error('مكتبة Claude مش موجودة جنب السيرفر (server/node_modules)'), {code: 'sdk-missing'}); }
  }
  return Anthropic;
}

/* o: {apiKey, model, effort, system, user, maxTokens} → {text, model, usage, stop} */
async function generate(o){
  const A = sdk();
  const client = new A({apiKey: o.apiKey, maxRetries: 2, timeout: 20 * 60 * 1000});
  let msg;
  try{
    // streaming + finalMessage: التقرير ممكن يطول، فده بيمنع انتهاء مهلة الطلب
    const stream = client.beta.messages.stream({
      model: o.model || 'claude-opus-5-5',
      max_tokens: o.maxTokens || 64000,
      // لو الطلب اترفض لسبب أمان: الـ API بيكمّله على نموذج تاني مناسب تلقائي
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {effort: o.effort || 'high'},
      system: o.system,
      messages: [{role: 'user', content: o.user}]
    });
    msg = await stream.finalMessage();
  }catch(e){
    if(e instanceof A.AuthenticationError || e instanceof A.PermissionDeniedError) throw Object.assign(new Error(e.message), {code: 'auth'});
    if(e instanceof A.RateLimitError) throw Object.assign(new Error(e.message), {code: 'rate'});
    if(e instanceof A.NotFoundError) throw Object.assign(new Error(e.message), {code: 'model'});
    if(e instanceof A.BadRequestError) throw Object.assign(new Error(e.message), {code: 'bad-request'});
    if(e instanceof A.APIConnectionTimeoutError) throw Object.assign(new Error(e.message), {code: 'timeout'});
    if(e instanceof A.APIConnectionError) throw Object.assign(new Error(e.message), {code: 'network'});
    if(e instanceof A.APIError) throw Object.assign(new Error(e.message), {code: 'http', status: e.status});
    throw e;
  }
  if(msg.stop_reason === 'refusal'){
    throw Object.assign(new Error((msg.stop_details && msg.stop_details.explanation) || 'refusal'), {code: 'refusal'});
  }
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  return {
    text, model: msg.model, stop: msg.stop_reason,
    usage: {input: msg.usage.input_tokens, output: msg.usage.output_tokens}
  };
}
module.exports = {generate};
