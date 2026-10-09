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
 // Android-плеер не обрабатывает звук: тип содержимого — музыка (не речь, под
 // которую часть телефонов включает голосовую обработку), а единственный
 // свой обработчик — ответвление для индикатора, которое ничего не меняет.
 {const java=await readFile('android/app/src/main/java/com/truethrills/listener/PlaybackService.java','utf8');
  assert.match(java,/setContentType\(C\.AUDIO_CONTENT_TYPE_MUSIC\)/,'Android-плеер объявляет звук не музыкой');
  assert.doesNotMatch(java,/AUDIO_CONTENT_TYPE_SPEECH/,'Android-плеер снова объявляет звук речью');
  assert.match(java,/setAudioProcessors\(new AudioProcessor\[\]\{ new TeeAudioProcessor\(new LevelTap\(\)\) \}\)/,'в Android-плеер добавлена обработка звука сверх ответвления для индикатора');
  assert.doesNotMatch(java,/SkipSilence|LoudnessEnhancer|Equalizer|DynamicsProcessing/,'в Android-плеере появилась обработка звука');}
 // Эфир и запись в студии — с запасом по качеству (владелец: «максимальное
 // качество для эфира»): с ПК Opus 320 кбит/с, на сервере AAC 320 кбит/с и
 // для слушателей, и для архива; запись черновика в студии — 320 кбит/с.
 {const live=await readFile('hooks/use-live.ts','utf8'),cap=await readFile('hooks/use-capture.ts','utf8'),worker=await readFile('server/live-worker.mjs','utf8');
  const bits=src=>[...src.matchAll(/audioBitsPerSecond:(\d+)/g)].map(m=>Number(m[1]));
  assert.ok(bits(live).length&&bits(live).every(b=>b>=320000),'эфир с ПК сжимается ниже 320 кбит/с: '+bits(live));
  assert.ok(bits(cap).length&&bits(cap).every(b=>b>=320000),'запись в студии сжимается ниже 320 кбит/с: '+bits(cap));
  assert.match(worker,/LIVE_AAC_BITRATE='3[2-9]\dk'/,'эфир на сервере сжимается ниже 320 кбит/с');
  assert.equal((worker.match(/'-b:a',LIVE_AAC_BITRATE/g)||[]).length,2,'поток слушателям и архив эфира сжимаются не с одним и тем же качеством');}
 // Полтора часа на 320 кбит/с (владелец: «лайв будет примерно на полтора
 // часа») — около 216 МБ. Один предел на весь путь: студия останавливает
 // запись не раньше 1 ч 40 мин, загрузка и плеер принимают такой файл, nginx
 // пропускает его тело. Своих чисел размера аудио (от 50 МБ) в коде быть не должно,
 // обложки (12 МБ) — отдельный предел.
 {const limits=await readFile('lib/audio-limits.ts','utf8'),mb=name=>{const m=limits.match(new RegExp(name+'\\s*=\\s*(\\d+)\\s*\\*\\s*1024\\s*\\*\\s*1024'));assert.ok(m,'нет предела '+name);return Number(m[1]);};
  const max=mb('AUDIO_MAX_BYTES'),stop=mb('RECORDING_STOP_BYTES'),minutes=bytesMb=>bytesMb*1024*1024*8/320000/60;
  assert.ok(minutes(stop)>=100,'запись в студии на 320 кбит/с остановится раньше 1 ч 40 мин: '+minutes(stop).toFixed(0)+' мин');
  assert.ok(stop<max,'запись останавливается позже, чем сервер готов её принять');
  for(const [file,use] of [['app/api/audio/route.ts','AUDIO_MAX_BYTES'],['lib/audio-file.ts','AUDIO_MAX_BYTES'],['app/studio.tsx','AUDIO_MAX_BYTES'],['components/studio/podcast-player.tsx','AUDIO_MAX_BYTES'],['hooks/use-capture.ts','RECORDING_STOP_BYTES']]){
   const src=await readFile(file,'utf8');assert.ok(src.includes(use),file+' не пользуется общим пределом '+use);
   assert.doesNotMatch(src,/\b([5-9]\d|[1-9]\d{2,})\s*\*\s*1024\s*\*\s*1024\b/,file+': свой предел размера вместо lib/audio-limits.ts');}
  const nginx=Number((await readFile('server/install-operations.sh','utf8')).match(/client_max_body_size (\d+)M;\//)?.[1]),setup=Number((await readFile('server/vps-setup.sh','utf8')).match(/client_max_body_size (\d+)M;/)?.[1]);
  assert.ok(nginx>max&&setup>max,'nginx отрежет файл раньше сервера: nginx '+nginx+'M/'+setup+'M, предел '+max+'M');}
 console.log('PASS: missing duration reproduced; finite duration and seek index restored; audio packets unchanged; seeking decodes; finalized WebM and MP3 preserved; invalid files rejected.');
}finally{await rm(dir,{recursive:true,force:true});}
