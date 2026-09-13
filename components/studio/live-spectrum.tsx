'use client';
// Горизонтальный спектр эфира: те же 32 полосы, что раньше шли кольцом вокруг
// логотипа, теперь стоят в ряд и прыгают на месте. Басы в центре, высокие по
// краям — зеркально, как на референсе, чтобы полоса читалась симметричной.
export function LiveSpectrum({levels,colors,active}:{levels:number[];colors:string[];active:boolean}){
 return <div className="live-spectrum" aria-hidden="true">{colors.map((color,i)=>{
  const band=i<colors.length/2?colors.length/2-1-i:i-colors.length/2;
  const value=active?Math.min(1,levels[band]??0):0;
  return <span key={i} style={{height:(8+value*92).toFixed(1)+'%',background:color}}/>;
 })}</div>;
}
