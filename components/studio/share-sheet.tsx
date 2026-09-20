'use client';
import {useEffect,useState} from 'react';
import {Check,Copy} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {TelegramIcon,WhatsappIcon,VkIcon,FacebookIcon,XIcon,MailIcon} from '@/components/studio/brand-icons';
import {shareTargets,type ShareKind,type SharePayload} from '@/lib/share';
import {useT} from '@/components/i18n-provider';

const ICON:Record<ShareKind,React.ComponentType<{size?:number}>>={telegram:TelegramIcon,whatsapp:WhatsappIcon,vk:VkIcon,facebook:FacebookIcon,x:XIcon,email:MailIcon};
const LABEL:Record<ShareKind,string>={telegram:'Telegram',whatsapp:'WhatsApp',vk:'VK',facebook:'Facebook',x:'X',email:'Email'};

/**
 * Окно «Поделиться» для ПК: системного листа там нет, поэтому площадки и адрес
 * показываем сами. На телефоне это окно не открывается — там делится система.
 */
export function ShareSheet({payload,onClose}:{payload:SharePayload|null;onClose:()=>void}){
 const {t}=useT();
 const [copied,setCopied]=useState(false);
 useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),2000);return ()=>clearTimeout(timer);},[copied]);
 if(!payload)return null;
 const copy=async()=>{try{await navigator.clipboard.writeText(payload.url);setCopied(true);}catch{setCopied(false);}};
 return <Dialog open onOpenChange={o=>{if(!o)onClose();}}><DialogContent className="share-dialog">
  <DialogHeader>
   <DialogDescription>{payload.title}</DialogDescription>
   <DialogTitle>{t('share.title')}</DialogTitle>
  </DialogHeader>
  <div className="share-targets">
   {shareTargets(payload).map(target=>{const Icon=ICON[target.kind];return (
    <a key={target.kind} className="share-target tt-pressable" href={target.href} target="_blank" rel="noopener noreferrer" onClick={onClose}>
     <Icon size={26}/><span>{LABEL[target.kind]}</span>
    </a>
   );})}
  </div>
  <div className="share-link">
   <input type="text" readOnly value={payload.url} aria-label={t('share.linkAria')} onFocus={e=>e.currentTarget.select()}/>
   <button type="button" className="primary-button" onClick={()=>void copy()}>
    {copied?<Check size={16}/>:<Copy size={16}/>}{copied?t('share.copied'):t('share.copy')}
   </button>
  </div>
 </DialogContent></Dialog>;
}
