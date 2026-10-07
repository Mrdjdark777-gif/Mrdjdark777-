import {PluginEventBus} from './event-bus';
import {
 PLUGIN_API_VERSION,PLUGIN_PERMISSIONS,
 type InstalledPlugin,type PluginContext,type PluginLogger,type PluginManifest,
 type PluginPermission,type TrueThrillsPlugin,
} from './types';

const ID=/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const NAME=/^[a-zA-Z0-9]+(?:[._:-][a-zA-Z0-9]+)*$/;
const VERSION=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const permissionSet=new Set<string>(PLUGIN_PERMISSIONS);

function validateManifest(manifest:PluginManifest){
 if(!ID.test(manifest.id))throw new Error(`Invalid plugin id: ${manifest.id}`);
 if(!manifest.name.trim())throw new Error(`Plugin ${manifest.id} has no name`);
 if(!VERSION.test(manifest.version))throw new Error(`Plugin ${manifest.id} has invalid version ${manifest.version}`);
 if(manifest.apiVersion!==PLUGIN_API_VERSION)throw new Error(`Plugin ${manifest.id} requires unsupported API ${manifest.apiVersion}`);
 if(!['builtin','mcp'].includes(manifest.protocol))throw new Error(`Plugin ${manifest.id} has unsupported protocol`);
 const permissions=new Set<string>();
 for(const permission of manifest.permissions){
  if(!permissionSet.has(permission))throw new Error(`Plugin ${manifest.id} requests unknown permission ${permission}`);
  if(permissions.has(permission))throw new Error(`Plugin ${manifest.id} repeats permission ${permission}`);
  permissions.add(permission);
 }
 const toolNames=new Set<string>();
 for(const tool of manifest.tools??[]){
  if(!NAME.test(tool.name))throw new Error(`Plugin ${manifest.id} has invalid tool ${tool.name}`);
  if(toolNames.has(tool.name))throw new Error(`Plugin ${manifest.id} repeats tool ${tool.name}`);
  toolNames.add(tool.name);
  if(tool.requiredPermission&&!permissions.has(tool.requiredPermission))throw new Error(`Plugin ${manifest.id} tool ${tool.name} requires undeclared permission ${tool.requiredPermission}`);
 }
 const publishes=manifest.events?.publishes??[],subscribes=manifest.events?.subscribes??[];
 for(const event of [...publishes,...subscribes])if(!NAME.test(event))throw new Error(`Plugin ${manifest.id} has invalid event ${event}`);
 if(publishes.length&&!permissions.has('events.publish'))throw new Error(`Plugin ${manifest.id} declares published events without events.publish`);
 if(subscribes.length&&!permissions.has('events.subscribe'))throw new Error(`Plugin ${manifest.id} declares subscriptions without events.subscribe`);
}

function defaultLogger(pluginId:string):PluginLogger{
 const prefix=`[plugin:${pluginId}]`;
 return {
  info:(message,details)=>details===undefined?console.info(prefix,message):console.info(prefix,message,details),
  warn:(message,details)=>details===undefined?console.warn(prefix,message):console.warn(prefix,message,details),
  error:(message,details)=>details===undefined?console.error(prefix,message):console.error(prefix,message,details),
 };
}

export class PluginHost{
 private readonly plugins=new Map<string,TrueThrillsPlugin>();
 private readonly enabled=new Set<string>();
 private readonly unsubscribe=new Map<string,Array<()=>void>>();
 readonly events=new PluginEventBus();

 register(plugin:TrueThrillsPlugin){
  validateManifest(plugin.manifest);
  const {id}=plugin.manifest;
  if(this.plugins.has(id))throw new Error(`Plugin already registered: ${id}`);
  const declared=new Set((plugin.manifest.tools??[]).map(tool=>tool.name));
  for(const name of Object.keys(plugin.tools??{}))if(!declared.has(name))throw new Error(`Plugin ${id} implements undeclared tool ${name}`);
  for(const name of declared)if(!plugin.tools?.[name])throw new Error(`Plugin ${id} declares tool without handler: ${name}`);
  if((plugin.manifest.events?.subscribes?.length??0)>0&&!plugin.onEvent)throw new Error(`Plugin ${id} declares subscriptions without onEvent handler`);
  this.plugins.set(id,plugin);
  return this;
 }

 async enable(id:string){
  const plugin=this.require(id);if(this.enabled.has(id))return;
  const context=this.context(plugin);
  const subscriptions:Array<()=>void>=[];
  for(const type of plugin.manifest.events?.subscribes??[]){
   subscriptions.push(this.events.subscribe(id,type,event=>plugin.onEvent!(event,context)));
  }
  try{await plugin.start?.(context);this.unsubscribe.set(id,subscriptions);this.enabled.add(id);}
  catch(error){for(const stop of subscriptions)stop();throw error;}
 }

 async disable(id:string){
  const plugin=this.require(id);if(!this.enabled.has(id))return;
  await plugin.stop?.(this.context(plugin));
  for(const stop of this.unsubscribe.get(id)??[])stop();
  this.unsubscribe.delete(id);this.enabled.delete(id);
 }

 async enableAll(){for(const id of this.plugins.keys())await this.enable(id);}
 async disableAll(){for(const id of [...this.enabled].reverse())await this.disable(id);}

 list():InstalledPlugin[]{
  return [...this.plugins.values()].map(({manifest})=>({
   id:manifest.id,name:manifest.name,version:manifest.version,apiVersion:manifest.apiVersion,
   protocol:manifest.protocol,description:manifest.description,permissions:[...manifest.permissions],
   tools:[...(manifest.tools??[])],events:{publishes:[...(manifest.events?.publishes??[])],subscribes:[...(manifest.events?.subscribes??[])]},
   enabled:this.enabled.has(manifest.id),
  }));
 }

 async invoke(id:string,toolName:string,input:unknown){
  const plugin=this.require(id);if(!this.enabled.has(id))throw new Error(`Plugin is disabled: ${id}`);
  const definition=plugin.manifest.tools?.find(tool=>tool.name===toolName);
  const handler=plugin.tools?.[toolName];
  if(!definition||!handler)throw new Error(`Unknown plugin tool: ${id}.${toolName}`);
  if(definition.requiredPermission&&!plugin.manifest.permissions.includes(definition.requiredPermission))throw new Error(`Plugin ${id} lacks ${definition.requiredPermission}`);
  return handler(input,this.context(plugin));
 }

 private require(id:string){const plugin=this.plugins.get(id);if(!plugin)throw new Error(`Unknown plugin: ${id}`);return plugin;}

 private context(plugin:TrueThrillsPlugin):PluginContext{
  const permissions=new Set<PluginPermission>(plugin.manifest.permissions);
  const publishes=new Set(plugin.manifest.events?.publishes??[]);
  return {
   pluginId:plugin.manifest.id,
   hasPermission:permission=>permissions.has(permission),
   events:{publish:async(type,payload)=>{
    if(!permissions.has('events.publish'))throw new Error(`Plugin ${plugin.manifest.id} lacks events.publish`);
    if(!publishes.has(type))throw new Error(`Plugin ${plugin.manifest.id} did not declare event ${type}`);
    return this.events.publish(plugin.manifest.id,type,payload);
   }},
   logger:defaultLogger(plugin.manifest.id),
  };
 }
}
