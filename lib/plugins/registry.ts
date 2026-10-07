import {PluginHost} from './host';
import {notificationsPlugin} from './builtin/notifications';

const hostKey=Symbol.for('true-thrills.plugin-host.v1');
type GlobalPlugins=typeof globalThis&{[hostKey]?:PluginHost};

export async function getPluginHost(){
 const globalPlugins=globalThis as GlobalPlugins;
 if(!globalPlugins[hostKey]){
  const host=new PluginHost();
  host.register(notificationsPlugin);
  await host.enableAll();
  globalPlugins[hostKey]=host;
 }
 return globalPlugins[hostKey]!;
}
