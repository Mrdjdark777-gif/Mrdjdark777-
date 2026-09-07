import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './lib/capture-settings';export * from './lib/capture-graph';export * from './lib/opus-stereo';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {parseCaptureSettings,captureGraph,stereoDescription}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
assert.equal(parseCaptureSettings('{bad').device,'default');assert.equal(parseCaptureSettings(JSON.stringify({mode:'daw',device:'cable',channel:'stereo',gainDb:999})).gainDb,12);assert.equal(parseCaptureSettings(JSON.stringify({channel:'3'})).channel,'0');
const nodes=[];function node(type){const n={type,links:[],gain:{value:1},frequency:{value:0},Q:{value:0},stream:{},connect(target,output=0){this.links.push({target,output});}};nodes.push(n);return n;}
const context={createMediaStreamSource:()=>node('source'),createChannelSplitter:()=>node('split'),createGain:()=>node('gain'),createBiquadFilter:()=>node('filter'),createMediaStreamDestination:()=>node('dest'),createAnalyser:()=>node('analyser')};
const stereo=captureGraph(context,{},'stereo',{gainDb:0,muted:false,lowCut:false});assert.equal(stereo.gain.channelCount,2);assert.equal(nodes.find(n=>n.type==='dest').channelCount,2);assert.equal(nodes[0].links[0].target,stereo.filter);assert.equal(stereo.analysers.length,2);
nodes.length=0;const mono=captureGraph(context,{},'1',{gainDb:6,muted:false,lowCut:true});assert.equal(mono.gain.channelCount,1);assert.equal(nodes[1].links[0].output,1);assert.equal(mono.filter.type,'highpass');
const sdp='v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;stereo=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 VP8/90000\r\n';const fixed=stereoDescription({type:'offer',sdp});assert.match(fixed.sdp,/minptime=10;stereo=1;sprop-stereo=1/);assert.equal(fixed.sdp.split('m=video')[1],sdp.split('m=video')[1]);assert.deepEqual(stereoDescription(fixed),fixed);
assert.match(stereoDescription({type:'answer',sdp:sdp.replace(/a=fmtp:[^\r]*\r\n/,'')}).sdp,/a=fmtp:111 stereo=1;sprop-stereo=1\r\n/);
console.log('PASS: capture settings, separate stereo paths/meters, selected mono channel, stereo SDP negotiation.');
