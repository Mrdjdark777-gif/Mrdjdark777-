import {failure,requireOwner,result} from '@/lib/server';
import {getPluginHost} from '@/lib/plugins/registry';
import {PLUGIN_API_VERSION} from '@/lib/plugins/types';

export const runtime='nodejs';

export async function GET(req:Request){
 try{
  await requireOwner(req);
  const host=await getPluginHost();
  return result({apiVersion:PLUGIN_API_VERSION,plugins:host.list()});
 }catch(error){return failure(error);}
}
