import {deviceLimit,flushPush} from '@/lib/push';
import type {TrueThrillsPlugin} from '../types';

export const notificationsPlugin:TrueThrillsPlugin={
 manifest:{
  id:'truethrills.notifications',
  name:'Notifications',
  version:'1.0.0',
  apiVersion:'1',
  protocol:'builtin',
  description:'Push delivery adapter for True Thrills.',
  permissions:['notifications.read','notifications.send','events.publish'],
  tools:[
   {name:'capacity',description:'Return the configured push-device capacity.',requiredPermission:'notifications.read'},
   {name:'flushPending',description:'Attempt delivery of pending push notifications.',destructive:true,requiredPermission:'notifications.send'},
  ],
  events:{publishes:['notifications.flushed']},
 },
 tools:{
  capacity:()=>({deviceLimit:deviceLimit()}),
  flushPending:async(_input,context)=>{
   await flushPush();
   await context.events.publish('notifications.flushed',{at:Date.now()});
   return {ok:true};
  },
 },
};
