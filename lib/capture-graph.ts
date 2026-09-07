export function captureGraph(context:AudioContext,input:MediaStream,channel:string,controls:{gainDb:number;muted:boolean;lowCut:boolean}){
 const source=context.createMediaStreamSource(input),split=context.createChannelSplitter(2),hp=context.createBiquadFilter(),gain=context.createGain(),dest=context.createMediaStreamDestination(),stereo=channel==='stereo';
 gain.channelCount=stereo?2:1;gain.channelCountMode='explicit';gain.gain.value=controls.muted?0:10**(controls.gainDb/20);hp.type=controls.lowCut?'highpass':'allpass';hp.frequency.value=80;hp.Q.value=0.707;
 if(stereo)source.connect(hp);else{source.connect(split);split.connect(hp,Number(channel));}hp.connect(gain);gain.connect(dest);dest.channelCount=stereo?2:1;dest.channelCountMode='explicit';
 const meterSplit=context.createChannelSplitter(stereo?2:1);gain.connect(meterSplit);const analysers=Array.from({length:stereo?2:1},(_,i)=>{const a=context.createAnalyser();a.fftSize=2048;meterSplit.connect(a,i);return a;});return{gain,filter:hp,stream:dest.stream,analysers};
}
