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
