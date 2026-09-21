'use client';
export type Progress={id:string;position:number;duration:number;updatedAt:number};
const key='tt-listening-v1';
export function readProgress():Progress[]{try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data.filter(p=>typeof p.id==='string'&&Number.isFinite(p.position)&&p.position>=0&&Number.isFinite(p.duration)&&Number.isFinite(p.updatedAt)).slice(0,100):[];}catch{return [];}}
export function saveProgress(id:string,position:number,duration:number){if(!id||!Number.isFinite(position)||!Number.isFinite(duration))return;try{
  const list=readProgress(),next={id,position:duration>0&&position>=duration-2?0:Math.max(0,position),duration:Math.max(0,duration),updatedAt:Date.now()};
  // При запуске приложение спрашивает у фонового плеера, что он держит, и
  // записывает то же самое место. Такой повтор не должен считаться новым
  // прослушиванием: иначе каждый запуск сдвигал бы отметку времени.
  if(same(list[0],next))return;
  localStorage.setItem(key,JSON.stringify([next,...list.filter(p=>p.id!==id)].slice(0,100)));window.dispatchEvent(new Event('tt-progress'));}catch{}}
const same=(a:Progress|undefined,b:Progress)=>!!a&&a.id===b.id&&Math.round(a.position)===Math.round(b.position)&&Math.round(a.duration)===Math.round(b.duration);

// Убрать строку «Продолжить» для одной записи. Человек мог включить выпуск
// случайно или уже не хотеть к нему возвращаться, а строка висела на главной
// и убрать её было нечем.
export function dropProgress(id:string){if(!id)return;try{
  const left=readProgress().filter(p=>p.id!==id);
  localStorage.setItem(key,JSON.stringify(left));window.dispatchEvent(new Event('tt-progress'));}catch{}}
