/**
 * Куда можно отдать ссылку.
 *
 * На телефоне делиться умеет сама система: в приложении это Intent через мост,
 * в браузере — navigator.share. Оба открывают привычный лист со всеми
 * установленными мессенджерами, и подменять его своим окном незачем.
 *
 * На ПК такого листа нет, поэтому окно рисуем сами — как это делает YouTube:
 * ряд площадок и строка с адресом, которую можно скопировать.
 */
export type ShareKind='telegram'|'whatsapp'|'vk'|'facebook'|'x'|'email';
export type ShareTarget={kind:ShareKind;href:string};
export type SharePayload={url:string;title:string;text?:string};

/** Адрес для «поделиться» всегда абсолютный: относительный в чужом мессенджере бесполезен. */
export function shareUrl(path:string,origin:string){
 try{return new URL(path,origin).toString();}catch{return path;}
}

export function shareTargets({url,title}:SharePayload):ShareTarget[]{
 const u=encodeURIComponent(url),t=encodeURIComponent(title);
 return [
  {kind:'telegram',href:`https://t.me/share/url?url=${u}&text=${t}`},
  {kind:'whatsapp',href:`https://api.whatsapp.com/send?text=${encodeURIComponent(title+' '+url)}`},
  {kind:'vk',href:`https://vk.com/share.php?url=${u}&title=${t}`},
  {kind:'facebook',href:`https://www.facebook.com/sharer/sharer.php?u=${u}`},
  {kind:'x',href:`https://twitter.com/intent/tweet?url=${u}&text=${t}`},
  {kind:'email',href:`mailto:?subject=${t}&body=${encodeURIComponent(title+'\n'+url)}`},
 ];
}

/**
 * Что делать по нажатию: отдать системе или открыть своё окно. Решение вынесено
 * из компонента, чтобы его можно было проверить без браузера.
 */
export type ShareRoute='native'|'web'|'sheet';
export function shareRoute(env:{native:boolean;webShare:boolean}):ShareRoute{
 if(env.native)return 'native';
 if(env.webShare)return 'web';
 return 'sheet';
}

/**
 * Чем делится кнопка в шапке.
 *
 * Владелец спросил прямо: «она делится какой ссылкой и чем вообще я делюсь?» —
 * и это был справедливый вопрос. Кнопка отдавала канал всегда, в каком бы
 * разделе человек ни стоял: из «Историй» уходила ссылка на главную.
 *
 * Правило теперь одно и общее для всех кнопок: делимся тем, над чем кнопка
 * стоит. Шапка стоит над разделом — значит разделом. У выпуска, у записи
 * эфира и у плеера есть свои кнопки, и они делятся своим; шапка в их дела не
 * лезет.
 *
 * Настройки своей ссылки не имеют: делиться чужим экраном настроек незачем,
 * поэтому оттуда уходит канал.
 */
export type ShareHere={view:string;titleKey:string};
export function shareHere(view:string):ShareHere{
 switch(view){
  case 'live':    return {view:'live',titleKey:'share.live'};
  case 'podcasts':return {view:'podcasts',titleKey:'heading.podcasts'};
  case 'videos':  return {view:'videos',titleKey:'heading.videos'};
  case 'stories': return {view:'stories',titleKey:'heading.stories'};
  default:        return {view:'home',titleKey:'share.channel'};
 }
}

/** Путь раздела для «поделиться». Открывается у слушателя, а не в студии. */
export function viewPath(view:string){return '/?mode=listen&view='+view;}

/** Путь выпуска, истории или записи эфира. Имя в адресе экранируется. */
export function postPath(id:string){return '/?mode=listen&post='+encodeURIComponent(id);}
