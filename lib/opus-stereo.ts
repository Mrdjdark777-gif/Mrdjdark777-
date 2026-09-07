/** RFC 7587: opus/48000/2 alone does not request stereo reception. */
export function stereoDescription(description:RTCSessionDescriptionInit):RTCSessionDescriptionInit{
 if(!description.sdp)return description;
 const sdp=description.sdp.split(/(?=^m=)/m).map(section=>{
  if(!section.startsWith('m=audio '))return section;
  for(const match of [...section.matchAll(/^a=rtpmap:(\d+) opus\/48000\/2\r?$/gmi)]){
   const id=match[1],re=new RegExp('^a=fmtp:'+id+' ([^\\r\\n]*)','m'),fmtp=section.match(re),parts=(fmtp?.[1]??'').split(';').map(x=>x.trim()).filter(x=>x&&!/^(stereo|sprop-stereo)=/.test(x));parts.push('stereo=1','sprop-stereo=1');
   const line='a=fmtp:'+id+' '+parts.join(';');section=fmtp?section.replace(re,line):section.replace(new RegExp('(^a=rtpmap:'+id+' [^\\r\\n]*)(\\r?\\n)','m'),'$1$2'+line+'$2');
  }return section;
 }).join('');return{...description,sdp};
}
