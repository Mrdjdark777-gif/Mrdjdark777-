'use client';
import {useState,type ComponentProps,type ReactNode} from 'react';

type Props=Omit<ComponentProps<'img'>,'src'|'onError'> & {src?:string;fallback?:ReactNode};
// Failed images are removed through React, never element.remove(). This keeps
// reconciliation safe when a post changes after an image error.
export function Artwork({src,fallback=null,...props}:Props){
 const [failedSource,setFailedSource]=useState<string>();
 if(!src||failedSource===src)return <>{fallback}</>;
 return <img {...props} src={src} alt={props.alt??''} onError={()=>setFailedSource(src)}/>;
}
