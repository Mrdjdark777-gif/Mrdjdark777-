import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
const dir=await mkdtemp(join(tmpdir(),'tt-audio-'));
const run=(...args)=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args]);
const probe=(file,...args)=>JSON.parse(execFileSync('ffprobe',['-v','error',...args,'-of','json',file],{encoding:'utf8'}));
try{
 await build({entryPoints:['lib/audio-file.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'audio.mjs')});
 const {prepareAudio}=await import(pathToFileURL(join(dir,'audio.mjs')));
 // Streaming WebM reproduces MediaRecorder's absent Duration/Cues.
 const original=join(dir,'recording.webm');run('-f','lavfi','-i','sine=frequency=660:sample_rate=48000','-t','12','-c:a','libopus','-f','webm','-live','1',original);
 assert.equal(probe(original,'-show_format').format.duration,undefined);
 const input=new Blob([await readFile(original)],{type:'audio/webm'});
 const result=await prepareAudio(input);assert.ok(result.duration>11.9&&result.duration<12.1);
 const repaired=join(dir,'repaired.webm');await writeFile(repaired,new Uint8Array(await result.blob.arrayBuffer()));
 const duration=Number(probe(repaired,'-show_format').format.duration);assert.ok(duration>11.9&&duration<12.1);
 const hashes=file=>probe(file,'-show_packets','-show_data_hash','sha256').packets.map(p=>p.data_hash);
 assert.deepEqual(hashes(repaired),hashes(original),'Encoded audio must remain byte-identical');
 run('-ss','7','-i',repaired,'-t','0.5','-f','null','-');
 const bytes=new Uint8Array(await result.blob.arrayBuffer());assert.ok(Buffer.from(bytes).includes(Buffer.from('1c53bb6b','hex')),'Seek index must be present');
 const again=await prepareAudio(result.blob);assert.strictEqual(again.blob,result.blob,'Finalized files should not be rewritten');
 const mp3=join(dir,'upload.mp3');run('-f','lavfi','-i','sine=frequency=330','-t','3','-c:a','libmp3lame',mp3);
 const mp3Blob=new Blob([await readFile(mp3)],{type:'audio/mpeg'});const mp3Result=await prepareAudio(mp3Blob);assert.strictEqual(mp3Result.blob,mp3Blob);assert.ok(mp3Result.duration>2.9&&mp3Result.duration<3.2);
 await assert.rejects(prepareAudio(new Blob(['not an audio file'])));
 await assert.rejects(prepareAudio(new Blob([])));
 console.log('PASS: missing duration reproduced; finite duration and seek index restored; audio packets unchanged; seeking decodes; finalized WebM and MP3 preserved; invalid files rejected.');
}finally{await rm(dir,{recursive:true,force:true});}
