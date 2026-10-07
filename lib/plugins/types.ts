export const PLUGIN_API_VERSION='1' as const;

export const PLUGIN_PERMISSIONS=[
 'events.publish',
 'events.subscribe',
 'content.read',
 'content.write',
 'notifications.read',
 'notifications.send',
 'storage.read',
 'storage.write',
 'network.outbound',
 'secrets.read',
] as const;

export type PluginPermission=typeof PLUGIN_PERMISSIONS[number];
export type PluginProtocol='builtin'|'mcp';

export type PluginToolDefinition={
 name:string;
 description:string;
 destructive?:boolean;
 requiredPermission?:PluginPermission;
};

export type PluginManifest={
 id:string;
 name:string;
 version:string;
 apiVersion:typeof PLUGIN_API_VERSION;
 protocol:PluginProtocol;
 description?:string;
 permissions:readonly PluginPermission[];
 tools?:readonly PluginToolDefinition[];
 events?:{
  publishes?:readonly string[];
  subscribes?:readonly string[];
 };
};

export type PluginEvent<T=unknown>={
 id:string;
 type:string;
 source:string;
 timestamp:number;
 payload:T;
};

export type PluginLogger={
 info:(message:string,details?:unknown)=>void;
 warn:(message:string,details?:unknown)=>void;
 error:(message:string,details?:unknown)=>void;
};

export type PluginContext={
 pluginId:string;
 hasPermission:(permission:PluginPermission)=>boolean;
 events:{publish:(type:string,payload?:unknown)=>Promise<PluginEvent>};
 logger:PluginLogger;
};

export type PluginToolHandler=(input:unknown,context:PluginContext)=>unknown|Promise<unknown>;

export type TrueThrillsPlugin={
 manifest:PluginManifest;
 tools?:Readonly<Record<string,PluginToolHandler>>;
 onEvent?:(event:PluginEvent,context:PluginContext)=>void|Promise<void>;
 start?:(context:PluginContext)=>void|Promise<void>;
 stop?:(context:PluginContext)=>void|Promise<void>;
};

export type InstalledPlugin={
 id:string;
 name:string;
 version:string;
 apiVersion:string;
 protocol:PluginProtocol;
 description?:string;
 permissions:readonly PluginPermission[];
 tools:readonly PluginToolDefinition[];
 events:{publishes:readonly string[];subscribes:readonly string[]};
 enabled:boolean;
};
