'use client';
import {Fragment} from 'react';
import {useT} from '@/components/i18n-provider';

/**
 * Общая шапка трёх разделов слушателя: «Аудио» — «Внутри истории.», «Видео» —
 * «Истории в кадре.», «Истории» — «Истории на страницах.». Одна разметка и
 * одни стили, чтобы разделы не расходились по оформлению.
 *
 * Заголовок слева, подзаголовок — колонкой справа от него, мельче. Строки
 * подзаголовка — отдельные блоки: стоят вплотную друг к другу и по центру
 * высоты заголовка, сверху и снизу поровну (стили: .voice-kicker).
 *
 * Переносы строк записаны в словаре («Внутри⏎истории»); если строка не
 * помещается в колонку, она переносится дальше сама, а не обрезается.
 */
export type SectionHeaderView='podcasts'|'videos'|'stories';

const KEYS:Record<SectionHeaderView,{headline:string;kicker:string}>={
 podcasts:{headline:'voice.headline',kicker:'voice.kicker'},
 videos:{headline:'video.headline',kicker:'video.kicker'},
 stories:{headline:'stories.headline',kicker:'stories.kicker'},
};

export function VoiceHeader({view='podcasts'}:{view?:SectionHeaderView}){
 const {t}=useT();
 const keys=KEYS[view];
 return <header className="voice-head" data-section={view}>
  <div className="voice-headline">
   <h1 className="voice-title">{t(keys.headline)}<span className="voice-stop" aria-hidden="true"/></h1>
   <p className="voice-kicker">{t(keys.kicker).split('\n').map((line,i)=><Fragment key={i}>{i>0&&' '}<span className="voice-kicker-line">{line}</span></Fragment>)}</p>
  </div>
 </header>;
}
