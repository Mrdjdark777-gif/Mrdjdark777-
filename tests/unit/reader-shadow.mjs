/** Lighting envelope and renderer plumbing. Does not replace GPU pixel tests. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import path from 'node:path';
const entry=process.env.TT_CURL_TEST_SOURCE||path.resolve('lib/page-curl.ts');
const {outputFiles}=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node'});
const {GONE,shadowEnvelope,createCurl}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
assert.ok(GONE>0&&GONE<=1,'geometry must define a finite landing point');
assert.equal(shadowEnvelope(0),0,'no lighting jump when DOM switches to canvas');
assert.equal(shadowEnvelope(GONE),0,'shadow must be gone before canvas is hidden');
assert.equal(shadowEnvelope(-1),0,'cancelled motion clamps to start');
assert.equal(shadowEnvelope(2),0,'overdrag clamps to end');
assert.ok(shadowEnvelope(GONE*.2)>.99,'shadow must be visible while page is lifted');
let previous=0;
for(let i=0;i<=10000;i++){
 const weight=shadowEnvelope(GONE*i/10000);
 assert.ok(Number.isFinite(weight)&&weight>=0&&weight<=1,'invalid shadow strength');
 assert.ok(Math.abs(weight-previous)<.002,'shadow envelope jumps between neighbouring frames');
 previous=weight;
}
assert.ok(shadowEnvelope(GONE*1e-4)<.00001,'start slope must approach zero');
assert.ok(shadowEnvelope(GONE*(1-1e-4))<.00001,'end slope must approach zero');
// Fake GL records real renderer calls, without claiming to render shader pixels.
const draws=[];let program;let buffers=[];
const gl=new Proxy({
 createShader:()=>({}),createProgram:()=>({uniforms:{}}),createBuffer:()=>({}),createTexture:()=>({}),
 getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,
 getUniformLocation:(p,n)=>({p,n}),useProgram:p=>{program=p;},
 uniform1f:(loc,v)=>{loc.p.uniforms[loc.n]=v;},
 bufferData:(_target,data)=>{buffers.push(Array.from(data));},
 drawArrays:()=>draws.push({...program.uniforms}),
}, {get:(obj,key)=>key in obj?obj[key]:key.toUpperCase()===key?1:()=>{}});
globalThis.window={devicePixelRatio:2};
assert.equal(createCurl({getContext:()=>null},[0,0,0]),null,'no WebGL must select fallback');
const canvas={getContext:()=>gl,getBoundingClientRect:()=>({width:390,height:844})};
const curl=createCurl(canvas,[0,0,0]);assert.ok(curl);
for(const forward of [true,false])for(const theme of [[0,0,0],[.078,.094,.102],[.957,.945,.918]]){
 curl.paper(theme);
 for(const p of [0,GONE*.01,GONE*.2,GONE*.85,GONE*.99,GONE]){
  draws.length=0;buffers=[];curl.draw(p,forward);
  assert.equal(draws[0].lighting,shadowEnvelope(p),'background shader must receive envelope');
  assert.equal(draws[0].flip,forward?0:1,'shadow must follow turn direction');
  for(const draw of draws)assert.equal(draw.lighting,shadowEnvelope(p),'sheet and cast shadow must fade together');
  for(const data of buffers)assert.ok(data.every(Number.isFinite),'mesh must have finite coordinates');
 }
}
curl.destroy();
console.log('PASS reader-shadow: endpoints, smooth ramps, cancel/overdrag, both directions, three tones, renderer uniforms, no-WebGL fallback');
