'use client';
import {Languages} from 'lucide-react';
import {LOCALES,LOCALE_COOKIE,LOCALE_NAMES} from '@/lib/i18n';
import {useT} from '@/components/i18n-provider';

/**
 * Язык выбирается на сервере по cookie и Accept-Language, поэтому ручной выбор
 * пишет cookie и перезагружает страницу: так первый же кадр приходит на нужном
 * языке и разметка сервера совпадает с клиентской.
 */
export function LanguageSettings(){
 const {t,locale}=useT();
 const manual=typeof document!=='undefined'&&document.cookie.split('; ').some(c=>c.startsWith(LOCALE_COOKIE+'='));
 function choose(value:string){
  document.cookie=value==='auto'
   ?`${LOCALE_COOKIE}=; path=/; max-age=0; samesite=lax`
   :`${LOCALE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
  location.reload();
 }
 return <section className="settings-panel"><div className="section-icon"><Languages size={22}/></div><h2>{t('lang.title')}</h2><p>{t('lang.text')}</p>
  <div className="language-options">
   <button className={!manual?'language-option is-active':'language-option'} onClick={()=>choose('auto')} aria-pressed={!manual}>{t('lang.auto')}</button>
   {LOCALES.map(code=><button key={code} className={manual&&locale===code?'language-option is-active':'language-option'} onClick={()=>choose(code)} aria-pressed={manual&&locale===code}>{LOCALE_NAMES[code]}</button>)}
  </div>
 </section>;
}
