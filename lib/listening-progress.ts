'use client';
export type Progress={id:string;position:number;duration:number;updatedAt:number};
const key='tt-listening-v1';
export function readProgress():Progress[]{try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data.filter(p=>typeof p.id==='string'&&Number.isFinite(p.position)&&p.position>=0&&Number.isFinite(p.duration)&&Number.isFinite(p.updatedAt)).slice(0,100):[];}catch{return [];}}
export function saveProgress(id:string,position:number,duration:number){if(!id||!Number.isFinite(position)||!Number.isFinite(duration))return;try{localStorage.setItem(key,JSON.stringify([{id,position:duration>0&&position>=duration-2?0:Math.max(0,position),duration:Math.max(0,duration),updatedAt:Date.now()},...readProgress().filter(p=>p.id!==id)].slice(0,100)));window.dispatchEvent(new Event('tt-progress'));}catch{}}
