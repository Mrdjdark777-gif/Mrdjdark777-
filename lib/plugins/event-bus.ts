import type {PluginEvent} from './types';

type Subscriber=(event:PluginEvent)=>void|Promise<void>;

export class PluginEventBus{
 private readonly subscribers=new Map<string,Map<string,Subscriber>>();

 subscribe(pluginId:string,type:string,handler:Subscriber){
  let byPlugin=this.subscribers.get(type);
  if(!byPlugin){byPlugin=new Map();this.subscribers.set(type,byPlugin);}
  if(byPlugin.has(pluginId))throw new Error(`Plugin ${pluginId} is already subscribed to ${type}`);
  byPlugin.set(pluginId,handler);
  return ()=>{
   const current=this.subscribers.get(type);
   current?.delete(pluginId);
   if(current?.size===0)this.subscribers.delete(type);
  };
 }

 async publish(source:string,type:string,payload:unknown):Promise<PluginEvent>{
  const event:PluginEvent={id:crypto.randomUUID(),type,source,timestamp:Date.now(),payload};
  const handlers=[...(this.subscribers.get(type)?.values()??[])];
  const settled=await Promise.allSettled(handlers.map(handler=>Promise.resolve().then(()=>handler(event))));
  for(const failed of settled.filter((result):result is PromiseRejectedResult=>result.status==='rejected')){
   console.error(`[plugin-event:${type}] subscriber failed`,failed.reason);
  }
  return event;
 }
}
