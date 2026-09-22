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

// Убранная строка «Продолжить».
//
// Стереть отметку прослушивания мало: при запуске приложение спрашивает у
// фонового плеера, что он держит, и записывает то же место обратно — строка
// возвращалась после каждого перезапуска. Поэтому убранное запоминаем
// отдельно, а снимаем отметку, когда человек сам открывает этот выпуск.
const hiddenKey='tt-resume-hidden-v1';
export function readResumeHidden():string[]{try{
  const data=JSON.parse(localStorage.getItem(hiddenKey)||'[]');
  return Array.isArray(data)?data.filter(id=>typeof id==='string'):[];}catch{return [];}}
export function hideResume(id:string){if(!id)return;try{
  const list=readResumeHidden();
  if(!list.includes(id))localStorage.setItem(hiddenKey,JSON.stringify([id,...list].slice(0,50)));
  window.dispatchEvent(new Event('tt-progress'));}catch{}}
export function unhideResume(id:string){if(!id)return;try{
  const list=readResumeHidden();
  if(!list.includes(id))return;
  localStorage.setItem(hiddenKey,JSON.stringify(list.filter(x=>x!==id)));
  window.dispatchEvent(new Event('tt-progress'));}catch{}}
