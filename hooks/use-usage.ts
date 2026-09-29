'use client';
import {useEffect} from 'react';
const completed=new Set<string>();
const pending=new Set<string>();
let token='';
function session(){return token||(token=crypto.randomUUID());}
/** Counts an opening / playback start, not a completed reading or unique person. */
export function useUsage(id:string,active:boolean){
 useEffect(()=>{
  if(!active||!id||completed.has(id)||pending.has(id))return;
  let cancelled=false;let retry:ReturnType<typeof setTimeout>|undefined;
  const send=async()=>{
   if(cancelled||completed.has(id)||pending.has(id))return;
   pending.add(id);
   try{
    const response=await fetch('/api/usage',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({id,session:session()}),keepalive:true});
    if(response.ok)completed.add(id);
   }catch{}finally{pending.delete(id);}
   if(!cancelled&&!completed.has(id))retry=setTimeout(()=>void send(),30000);
  };
  void send();return()=>{cancelled=true;if(retry)clearTimeout(retry);};
 },[id,active]);
}
