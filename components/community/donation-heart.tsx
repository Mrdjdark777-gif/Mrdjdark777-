'use client';
import {Heart} from 'lucide-react';
import {haptic} from '@/lib/client';
import {useT} from '@/components/i18n-provider';
import {DONATIONS,hostAllowed} from '@/lib/video';
import './style.css';
/**
 * Только адрес площадки, который настроил автор, и только тех площадок,
 * которые знает приложение. Список доменов не дублируем: он один и тот же
 * для сохранения в настройках и для показа — собственный список здесь уже
 * однажды разошёлся с общим и тихо выбросил Boosty.
 */
export function donationURL(value?:string){try{const u=new URL(value||'');return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&DONATIONS.some(d=>hostAllowed(u.hostname,d.hosts))?u.href:null;}catch{return null;}}
/**
 * Сердечко поддержки в плеере. Слот здесь один, поэтому это прямая ссылка на
 * площадку, уместную по языку телефона; выбор между площадками предлагает
 * кнопка поддержки в шапке.
 */
export function DonationHeart({href,compact=false}:{href?:string;compact?:boolean}){
 const {t}=useT();
 const url=donationURL(href);
 if(!url)return null;
 return <a className={'tt-donation-heart '+(compact?'is-compact':'')} href={url} target="_blank" rel="noopener noreferrer" aria-label={t('donate.action')} title={t('donate.voluntaryTitle')} onClick={e=>{e.stopPropagation();haptic();}}><Heart size={20}/>{!compact&&<span>{t('donate.supportAuthor')}<small>{t('donate.voluntaryNote')}</small></span>}</a>;
}
