'use client';
import {ArrowUpRight,Play} from 'lucide-react';
import {parseVideo} from '@/lib/video';
import {useT} from '@/components/i18n-provider';

/** Плеер для одного видео: встроенный кадр площадки, файл или ссылка наружу. */
export function VideoFrame({url,title}:{url:string;title:string}){
 const {t}=useT();
 const v=parseVideo(url);
 if(!v)return null;
 if(v.kind==='file')return <div className="video-frame"><video controls playsInline preload="metadata" src={v.embed}/></div>;
 if(v.kind==='link')return <a className="video-external" href={v.watch} target="_blank" rel="noopener noreferrer"><Play size={19}/><span>{t('video.watchOnPlatform')}</span><ArrowUpRight size={17}/></a>;
 return <div className={'video-frame'+(v.tall?' video-tall':'')}><iframe
  src={v.embed} title={title} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
  allowFullScreen/></div>;
}
