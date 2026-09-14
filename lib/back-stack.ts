/**
 * Системная кнопка «Назад» на Android. По спецификации она закрывает меню,
 * затем полный плеер, затем навигацию — и только исчерпав их, отдаёт нажатие
 * системе. Раньше WebView знал лишь про историю страницы, поэтому из
 * развёрнутого плеера Back выбрасывал из приложения целиком.
 *
 * Слои регистрируются теми же компонентами, которые их открывают, и снимаются
 * при закрытии: так порядок не расходится с тем, что человек видит на экране.
 */
export const BACK_MENU=40;      // меню «…» внутри плеера
export const BACK_PLAYER=30;    // развёрнутый плеер — сворачивается, не останавливается
export const BACK_OVERLAY=20;   // читалка, видео и другие листы поверх экрана
export const BACK_NAV=10;       // возврат на главную из раздела

type Layer={priority:number;handler:()=>boolean};
const layers:Layer[]=[];

/** Возвращает функцию снятия слоя. */
export function pushBackLayer(priority:number,handler:()=>boolean):()=>void{
 const layer:Layer={priority,handler};
 layers.push(layer);
 return()=>{const at=layers.indexOf(layer);if(at>=0)layers.splice(at,1);};
}

/**
 * Отдаёт нажатие самому верхнему слою. true — нажатие обработано и системе
 * его передавать не нужно. Слой может отказаться (вернуть false), тогда
 * очередь идёт дальше вниз.
 */
export function runBack():boolean{
 for(const layer of [...layers].sort((a,b)=>b.priority-a.priority||layers.indexOf(b)-layers.indexOf(a))){
  if(layer.handler())return true;
 }
 return false;
}

/** Только для тестов и перезапуска: снимает все слои. */
export function resetBackLayers():void{layers.length=0;}
