/**
 * Уведомления владельцу о сервере: Telegram и (по желанию) свой вебхук.
 *
 * Владелец (14 октября): «если что-то начнётся, я должен сразу же получать
 * уведомления… или сразу всё знать». Telegram — бесплатно и сразу на телефон.
 * Настройка — в .env сервера (не в коде и не в репозитории):
 *   TELEGRAM_BOT_TOKEN=123456:AA…   — токен бота от @BotFather;
 *   TELEGRAM_CHAT_ID=123456789      — куда писать (свой id, см. документ).
 * MONITOR_WEBHOOK_URL — прежний способ, остаётся как был: JSON на HTTPS-адрес.
 * Пустые значения — уведомления просто не уходят, монитор работает дальше.
 */
const TOKEN=/^\d{5,}:[A-Za-z0-9_-]{30,}$/,CHAT=/^-?\d{3,}$/;

export function telegramReady(env=process.env){
 return TOKEN.test(env.TELEGRAM_BOT_TOKEN||'')&&CHAT.test(env.TELEGRAM_CHAT_ID||'');
}

/** Отправить текст (и для вебхука — отчёт). Возвращает список ошибок доставки. */
export async function notify(text,report,env=process.env){
 const errors=[];
 if(telegramReady(env)){
  try{
   const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:String(text).slice(0,3900),disable_web_page_preview:true}),signal:AbortSignal.timeout(10000),redirect:'error'});
   if(!r.ok)errors.push('telegram '+r.status);
  }catch(e){errors.push('telegram '+(e?.name||'error'));}
 }
 if(env.MONITOR_WEBHOOK_URL){
  try{
   const url=new URL(env.MONITOR_WEBHOOK_URL);if(url.protocol!=='https:')throw new Error('Monitor webhook must use HTTPS');
   const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report??{text}),signal:AbortSignal.timeout(10000),redirect:'error'});
   if(!r.ok)errors.push('webhook '+r.status);
  }catch(e){errors.push('webhook '+(e?.message||'error'));}
 }
 return errors;
}

/** Заменить или дописать строки KEY=value в тексте .env, не трогая остальные. */
export function setEnvLines(text,pairs){
 let out=String(text);
 for(const [key,value] of Object.entries(pairs)){
  const line=key+'='+value,re=new RegExp('^'+key+'=.*$','m');
  out=re.test(out)?out.replace(re,()=>line):(out.endsWith('\n')||!out?out:out+'\n')+line+'\n';
 }
 return out;
}

/** Последний личный чат, написавший боту, — из ответа getUpdates. */
export function chatFromUpdates(body){
 const list=Array.isArray(body?.result)?body.result:[];
 for(let i=list.length-1;i>=0;i--){
  const chat=(list[i].message??list[i].edited_message??list[i].my_chat_member)?.chat;
  if(chat&&chat.type==='private'&&Number.isSafeInteger(chat.id))return String(chat.id);
 }
 return '';
}
