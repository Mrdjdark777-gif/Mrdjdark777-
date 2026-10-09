import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['lib/device-discovery.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {discoverMicrophones}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const events=[];let permitted=false;
const media={
 async getUserMedia(options){assert.deepEqual(options,{audio:true,video:false});events.push('permission');permitted=true;return {getTracks:()=>[{stop(){events.push('stop');permitted=false;}}]};},
 async enumerateDevices(){events.push('enumerate');return [{kind:'audioinput',deviceId:'interface',label:permitted?'KOMPLETE AUDIO 6':''},{kind:'audiooutput',deviceId:'speaker'},{kind:'audioinput',deviceId:''}];},
};
assert.equal((await discoverMicrophones(media,true))[0].label,'KOMPLETE AUDIO 6');
assert.deepEqual(events,['permission','enumerate','stop']);
assert.equal(permitted,false,'Temporary microphone must be released without making a recording');
events.length=0;await discoverMicrophones(media);assert.deepEqual(events,['enumerate']);
events.length=0;
await assert.rejects(discoverMicrophones({...media,async enumerateDevices(){throw new Error('device failure');}},true),/device failure/);
assert.deepEqual(events,['permission','stop']);
await assert.rejects(discoverMicrophones({...media,async getUserMedia(){throw new Error('permission denied');}},true),/permission denied/);
console.log('PASS: device labels before recording; passive discovery; temporary stream cleanup; permission failures');
