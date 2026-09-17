/**
 * Мост к оконному приложению на ПК.
 *
 * Строки меню над страницей у приложения больше нет — светлая системная полоса
 * была единственным светлым пятном поверх тёмной студии. Три её команды
 * переехали сюда, в шапку самой страницы. Оконная часть понимает эти же
 * сообщения и, кроме того, держит команды в системном меню окна (Alt+Space) —
 * на случай, если страница не загрузилась и нажать здесь нечего.
 */
export type DesktopCommand='reload'|'browser'|'about';

type WebView2=Window&{chrome?:{webview?:{postMessage:(message:string)=>void}}};

export function desktopBridge(win:Window|undefined=typeof window==='undefined'?undefined:window){
 return (win as WebView2|undefined)?.chrome?.webview;
}
export function isDesktopApp(win?:Window){return !!desktopBridge(win);}
export function sendDesktopCommand(command:DesktopCommand,win?:Window){
 const bridge=desktopBridge(win);
 if(!bridge)return false;
 try{bridge.postMessage('true-thrills:'+command);return true;}catch{return false;}
}
