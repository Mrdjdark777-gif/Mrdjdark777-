/** Read labels while a permission stream is alive; never start a recorder. */
export async function discoverMicrophones(media:Pick<MediaDevices,'getUserMedia'|'enumerateDevices'>,requestPermission=false){
 let permissionStream:MediaStream|undefined;
 try{
  if(requestPermission)permissionStream=await media.getUserMedia({audio:true,video:false});
  return (await media.enumerateDevices()).filter(d=>d.kind==='audioinput'&&!!d.deviceId);
 }finally{permissionStream?.getTracks().forEach(track=>track.stop());}
}
