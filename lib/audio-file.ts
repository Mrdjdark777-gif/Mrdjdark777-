import {t} from '@/lib/i18n/runtime';
import {Input,ALL_FORMATS,WEBM,BlobSource,Output,BufferTarget,WebMOutputFormat,EncodedAudioPacketSource,EncodedPacketSink} from 'mediabunny';

/** Finalize MediaRecorder WebM metadata/index without decoding or recompressing voice. */
export async function prepareAudio(blob:Blob){
 if(!blob.size||blob.size>80*1024*1024)throw new Error(t('audio.tooBig'));
 const input=new Input({source:new BlobSource(blob),formats:ALL_FORMATS});
 let output:Output<WebMOutputFormat,BufferTarget>|undefined;
 try{
  const track=await input.getPrimaryAudioTrack();if(!track)throw new Error(t('audio.noTrack'));
  const duration=await track.computeDuration();
  if(!Number.isFinite(duration)||duration<=0)throw new Error(t('audio.noDuration'));
  const metadataDuration=await input.getDurationFromMetadata();
  if(await input.getFormat()!==WEBM||(metadataDuration!==null&&Number.isFinite(metadataDuration)&&metadataDuration>0))return{blob,duration};
  const tracks=await input.getTracks();if(tracks.length!==1)throw new Error(t('audio.singleTrack'));
  const codec=await track.getCodec(),decoderConfig=await track.getDecoderConfig();
  if(!codec||!decoderConfig)throw new Error(t('audio.formatFailed'));
  const source=new EncodedAudioPacketSource(codec);
  output=new Output({format:new WebMOutputFormat(),target:new BufferTarget()});output.addAudioTrack(source);
  await output.start();let first=true;
  for await(const packet of new EncodedPacketSink(track).packets()){
   await source.add(packet,first?{decoderConfig}:undefined);first=false;
  }
  await output.finalize();if(!output.target.buffer)throw new Error(t('audio.prepareRecordFailed'));
  return{blob:new Blob([output.target.buffer],{type:'audio/webm'}),duration};
 }finally{if(output&&output.state!=='finalized')await output.cancel();input.dispose();}
}
