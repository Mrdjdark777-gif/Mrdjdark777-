'use client';
import {useEffect,useRef} from 'react';

/**
 * Фон-сетка приложения.
 *
 * В покое это неподвижный рисунок: сетка рисуется один раз и больше кадров не
 * тратит. Приложение играет звук часами, и постоянно крутящаяся анимация жгла
 * бы батарею впустую — поэтому цикл запускается только на время волны.
 *
 * Волна идёт от касания пустого места: сетка прогибается, качается и
 * успокаивается, после чего цикл останавливается совсем. Пока палец на
 * экране, сетка тянется за ним.
 */
const CELL=58;              // шаг сетки
const TOUCH_RADIUS=260;     // докуда тянется сетка за пальцем
const TOUCH_PULL=22;        // насколько тянется
const TOUCH_EASE=.08;       // с какой ленцой сетка догоняет палец
const RELEASE=850;          // мс: отпустил палец — сетка отходит не рывком
const RIPPLE_LIFE=2100;     // мс жизни волны
const RIPPLE_SPEED=250;     // px/с — скорость фронта
const RIPPLE_WIDTH=120;     // толщина фронта: шире — мягче
const RIPPLE_PUSH=22;       // размах прогиба
const TRAIL_PUSH=11;        // волна от ведения пальцем — тише нажатия
const TRAIL_EVERY=110;      // мс между волнами следа
const TRAIL_STEP=34;        // и не чаще, чем раз в столько пикселей пути
const LINE=[111,231,222] as const;   // бирюзовый канала
const REST_ALPHA=.055;      // сетка в покое: видно, что она есть, и не больше
const LIVE_ALPHA=.42;       // сетка под волной

type Ripple={x:number;y:number;born:number;push:number};
type Pointer={x:number;y:number;down:boolean};

export function KineticGrid(){
 const canvasRef=useRef<HTMLCanvasElement>(null);
 const ripples=useRef<Ripple[]>([]);
 const pointer=useRef<Pointer>({x:-9999,y:-9999,down:false});
 // Сглаженный палец: сетка тянется за ним с ленцой, а не прыгает по точкам.
 const eased=useRef({x:-9999,y:-9999});
 const trail=useRef({at:0,x:0,y:0});
 // Сила притяжения к пальцу: 1 пока палец на экране, дальше плавно к нулю.
 const grip=useRef(0);
 const lifted=useRef(0);
 const raf=useRef(0);
 const size=useRef({w:0,h:0});

 useEffect(()=>{
  const canvas=canvasRef.current;
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  // Системная настройка «уменьшить анимацию» выключает движение целиком:
  // остаётся тот же рисунок, но без волн.
  const calm=window.matchMedia('(prefers-reduced-motion: reduce)');

  const resize=()=>{
   const dpr=Math.min(2,window.devicePixelRatio||1);
   const w=window.innerWidth,h=window.innerHeight;
   size.current={w,h};
   canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
   canvas.style.width=w+'px';canvas.style.height=h+'px';
   ctx.setTransform(dpr,0,0,dpr,0,0);
   draw(performance.now());
  };

  /** Смещение точки: сумма волн и притяжения к пальцу. */
  const shift=(x:number,y:number,now:number,pin:number)=>{
   let dx=0,dy=0;
   for(const r of ripples.current){
    const age=(now-r.born)/RIPPLE_LIFE;
    if(age>=1)continue;
    const ox=x-r.x,oy=y-r.y,dist=Math.hypot(ox,oy);
    // Фронт замедляется к концу жизни, а не летит с одной скоростью: так
    // волна выглядит как затухающий удар, а не как ползущее кольцо.
    const travel=1-(1-age)*(1-age);
    const diff=dist-travel*RIPPLE_SPEED*(RIPPLE_LIFE/1000);
    if(Math.abs(diff)>RIPPLE_WIDTH)continue;
    // Профиль фронта сглажен: у линейного треугольника видно изломы, и
    // движение читается рублеными шагами.
    const edge=1-Math.abs(diff)/RIPPLE_WIDTH;
    const shape=edge*edge*(3-2*edge);
    const fade=(1-age)*(1-age);
    // Знак меняется на фронте: перед волной сетку выгибает вперёд, за ней
    // тянет назад — отсюда ощущение отдачи, а не простого расширения круга.
    const force=shape*fade*r.push*(diff<0?-1:1)*-1;
    const angle=Math.atan2(oy,ox);
    dx+=Math.cos(angle)*force;dy+=Math.sin(angle)*force;
   }
   const e=eased.current,hold=grip.current;
   if(hold>.001&&e.x>-9000){
    const ox=x-e.x,oy=y-e.y,dist=Math.hypot(ox,oy);
    if(dist<TOUCH_RADIUS&&dist>1){
     const t=1-dist/TOUCH_RADIUS;
     const pull=t*t*(3-2*t)*TOUCH_PULL*hold;
     const angle=Math.atan2(oy,ox);
     dx-=Math.cos(angle)*pull;dy-=Math.sin(angle)*pull;
    }
   }
   return {dx:dx*pin,dy:dy*pin};
  };

  const draw=(now:number)=>{
   const {w,h}=size.current;
   if(!w||!h)return;
   ctx.clearRect(0,0,w,h);
   const cols=Math.ceil(w/CELL)+1,rows=Math.ceil(h/CELL)+1;
   const stepX=w/(cols-1),stepY=h/(rows-1);
   const px:number[][]=[],py:number[][]=[],pa:number[][]=[];
   for(let row=0;row<rows;row++){
    px[row]=[];py[row]=[];pa[row]=[];
    for(let col=0;col<cols;col++){
     const gx=col*stepX,gy=row*stepY;
     // Края закреплены: иначе сетка отрывается от границ экрана.
     const pin=Math.min(1,col/1.5,(cols-1-col)/1.5)*Math.min(1,row/1.5,(rows-1-row)/1.5);
     const {dx,dy}=shift(gx,gy,now,pin);
     px[row][col]=gx+dx;py[row][col]=gy+dy;
     pa[row][col]=Math.min(1,Math.hypot(dx,dy)/9);
    }
   }
   const seg=(x1:number,y1:number,x2:number,y2:number,t:number)=>{
    const alpha=REST_ALPHA+(LIVE_ALPHA-REST_ALPHA)*t;
    ctx.strokeStyle=`rgba(${LINE[0]},${LINE[1]},${LINE[2]},${alpha.toFixed(3)})`;
    ctx.lineWidth=t>0?1:.7;
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
   };
   for(let row=0;row<rows;row++)
    for(let col=0;col<cols-1;col++)
     seg(px[row][col],py[row][col],px[row][col+1],py[row][col+1],(pa[row][col]+pa[row][col+1])/2);
   for(let col=0;col<cols;col++)
    for(let row=0;row<rows-1;row++)
     seg(px[row][col],py[row][col],px[row+1][col],py[row+1][col],(pa[row][col]+pa[row+1][col])/2);
   // Узлы загораются только там, где сетку повело: в покое их не видно.
   for(let row=0;row<rows;row++)
    for(let col=0;col<cols;col++){
     const t=pa[row][col];
     if(t<=.02)continue;
     ctx.beginPath();
     ctx.arc(px[row][col],py[row][col],1+1.6*t,0,Math.PI*2);
     ctx.fillStyle=`rgba(${LINE[0]},${LINE[1]},${LINE[2]},${(t*.75).toFixed(3)})`;
     ctx.fill();
    }
  };

  const tick=(now:number)=>{
   ripples.current=ripples.current.filter(r=>now-r.born<RIPPLE_LIFE);
   // Палец сетка догоняет плавно: без этого при ведении она дёргается за
   // каждым событием указателя.
   const p=pointer.current,e=eased.current;
   if(p.down){
    if(e.x<-9000){e.x=p.x;e.y=p.y;}
    e.x+=(p.x-e.x)*TOUCH_EASE;e.y+=(p.y-e.y)*TOUCH_EASE;
    grip.current=1;
   }else if(grip.current>0){
    // Палец убрали — сетка отпускает его не рывком, а за RELEASE миллисекунд.
    const gone=(now-lifted.current)/RELEASE;
    const t=Math.min(1,Math.max(0,gone));
    grip.current=1-t*t*(3-2*t);
    e.x+=(p.x-e.x)*TOUCH_EASE;e.y+=(p.y-e.y)*TOUCH_EASE;
   }
   draw(now);
   if(ripples.current.length||p.down||grip.current>.001)raf.current=requestAnimationFrame(tick);
   else{raf.current=0;grip.current=0;eased.current={x:-9999,y:-9999};draw(now);}
  };
  const wake=()=>{if(!raf.current)raf.current=requestAnimationFrame(tick);};

  // Волну запускает только пустое место: нажатия на кнопки, ссылки, поля и
  // карточки остаются нажатиями, а не превращаются в фейерверк.
  const interactive='button,a,input,select,textarea,label,[role="button"],[data-slot="slider"]';
  const onDown=(e:PointerEvent)=>{
   const target=e.target as HTMLElement|null;
   if(!target||target.closest(interactive))return;
   pointer.current={x:e.clientX,y:e.clientY,down:true};
   eased.current={x:e.clientX,y:e.clientY};
   grip.current=1;
   trail.current={at:performance.now(),x:e.clientX,y:e.clientY};
   if(!calm.matches)ripples.current.push({x:e.clientX,y:e.clientY,born:performance.now(),push:RIPPLE_PUSH});
   wake();
  };
  /**
   * Ведение пальцем. Слушаем и указатель, и касание: на телефоне при прокрутке
   * браузер забирает жест себе и указатель обрывается — тогда остаются только
   * события касания, а след за пальцем должен идти всё равно.
   */
  const track=(x:number,y:number)=>{
   const p=pointer.current;
   p.x=x;p.y=y;
   if(!p.down){p.down=true;if(eased.current.x<-9000)eased.current={x,y};}
   grip.current=1;
   if(calm.matches){wake();return;}
   const t=trail.current,now=performance.now();
   if(now-t.at<TRAIL_EVERY||Math.hypot(x-t.x,y-t.y)<TRAIL_STEP){wake();return;}
   t.at=now;t.x=x;t.y=y;
   ripples.current.push({x,y,born:now,push:TRAIL_PUSH});
   wake();
  };
  const onMove=(e:PointerEvent)=>{if(pointer.current.down)track(e.clientX,e.clientY);};
  const onTouch=(e:TouchEvent)=>{const t=e.touches[0];if(t)track(t.clientX,t.clientY);};
  const onUp=()=>{if(!pointer.current.down)return;pointer.current.down=false;lifted.current=performance.now();wake();};
  const onHide=()=>{if(document.hidden){cancelAnimationFrame(raf.current);raf.current=0;ripples.current=[];pointer.current.down=false;grip.current=0;eased.current={x:-9999,y:-9999};draw(performance.now());}};

  resize();
  window.addEventListener('resize',resize);
  window.addEventListener('pointerdown',onDown,{passive:true});
  window.addEventListener('pointermove',onMove,{passive:true});
  window.addEventListener('touchmove',onTouch,{passive:true});
  window.addEventListener('touchend',onUp,{passive:true});
  window.addEventListener('pointerup',onUp,{passive:true});
  window.addEventListener('pointercancel',onUp,{passive:true});
  document.addEventListener('visibilitychange',onHide);
  return()=>{
   cancelAnimationFrame(raf.current);raf.current=0;
   window.removeEventListener('resize',resize);
   window.removeEventListener('pointerdown',onDown);
   window.removeEventListener('pointermove',onMove);
   window.removeEventListener('touchmove',onTouch);
   window.removeEventListener('touchend',onUp);
   window.removeEventListener('pointerup',onUp);
   window.removeEventListener('pointercancel',onUp);
   document.removeEventListener('visibilitychange',onHide);
  };
 },[]);

 return <canvas ref={canvasRef} className="kinetic-grid" aria-hidden="true"/>;
}
export default KineticGrid;
