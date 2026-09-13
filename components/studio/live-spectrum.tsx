'use client';
// Горизонтальный спектр эфира: 32 частотные полосы растянуты на 64 столбика,
// низкие слева, высокие справа. Между соседними полосами значение
// интерполируется, чтобы ряд читался плавной кривой, а не лесенкой.
const BARS=64;
export function LiveSpectrum({levels,active}:{levels:number[];active:boolean}){
 const last=levels.length-1;
 return <div className="live-spectrum" aria-hidden="true">{Array.from({length:BARS},(_,i)=>{
  const at=last>0?i/(BARS-1)*last:0,lo=Math.floor(at),hi=Math.min(last,lo+1),mix=at-lo;
  const value=active&&last>=0?Math.min(1,(levels[lo]??0)*(1-mix)+(levels[hi]??0)*mix):0;
  return <span key={i} style={{height:(8+value*92).toFixed(1)+'%'}}/>;
 })}</div>;
}
