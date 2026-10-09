#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';

const root=path.resolve(import.meta.dirname,'..');
const {outputFiles}=await build({entryPoints:[path.join(root,'lib/plugins/host.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const {PluginHost}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

const events=[];
const listener={
 manifest:{id:'test.listener',name:'Listener',version:'1.0.0',apiVersion:'1',protocol:'builtin',permissions:['events.subscribe'],events:{subscribes:['content.published']}},
 onEvent:event=>{events.push(event);},
};
const publisher={
 manifest:{id:'test.publisher',name:'Publisher',version:'1.0.0',apiVersion:'1',protocol:'builtin',permissions:['events.publish'],tools:[{name:'publish',description:'Publish test event'}],events:{publishes:['content.published']}},
 tools:{publish:(_input,context)=>context.events.publish('content.published',{id:'42'})},
};
const noisy={manifest:{id:'test.noisy',name:'Noisy',version:'1.0.0',apiVersion:'1',protocol:'builtin',permissions:['events.subscribe'],events:{subscribes:['content.published']}},onEvent:()=>{throw new Error('listener boom')}};
const host=new PluginHost();host.register(listener).register(noisy).register(publisher);await host.enableAll();
assert.equal(host.list().length,3);
assert.equal(host.list().every(item=>item.enabled),true);
const oldError=console.error;console.error=()=>{};const emitted=await host.invoke('test.publisher','publish',{});console.error=oldError;
assert.equal(emitted.type,'content.published');assert.equal(emitted.source,'test.publisher');
assert.equal(events.length,1);assert.deepEqual(events[0].payload,{id:'42'});
await assert.rejects(()=>host.invoke('test.publisher','missing',{}),/Unknown plugin tool/);
await assert.rejects(()=>host.invoke('missing','publish',{}),/Unknown plugin/);
await host.disable('test.publisher');
await assert.rejects(()=>host.invoke('test.publisher','publish',{}),/disabled/);
await host.disableAll();assert.equal(host.list().some(item=>item.enabled),false);

assert.throws(()=>new PluginHost().register({...publisher,manifest:{...publisher.manifest,id:'Bad ID'}}),/Invalid plugin id/);
assert.throws(()=>new PluginHost().register({...publisher,manifest:{...publisher.manifest,permissions:[]}}),/without events.publish/);
assert.throws(()=>new PluginHost().register({...publisher,manifest:{...publisher.manifest,permissions:['events.publish','root.shell']}}),/unknown permission/);
assert.throws(()=>new PluginHost().register({...publisher,manifest:{...publisher.manifest,tools:[{name:'publish',description:'x',requiredPermission:'notifications.send'}]}}),/undeclared permission/);
assert.throws(()=>{const x=new PluginHost();x.register(publisher);x.register(publisher);},/already registered/);

const blocked={
 manifest:{id:'test.blocked',name:'Blocked',version:'1.0.0',apiVersion:'1',protocol:'builtin',permissions:[],tools:[{name:'go',description:'No event permission'}]},
 tools:{go:(_input,context)=>context.events.publish('content.published',{})},
};
const blockedHost=new PluginHost();blockedHost.register(blocked);await blockedHost.enableAll();
await assert.rejects(()=>blockedHost.invoke('test.blocked','go',{}),/lacks events.publish/);

console.log('PASS plugins: manifests, permissions, tools, enable/disable and event bus isolation');
