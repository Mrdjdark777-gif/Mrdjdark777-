'use client';
import {createContext,useContext,useMemo,type ReactNode} from 'react';
import {DEFAULT_LOCALE,LOCALE_TAGS,translate,type Locale} from '@/lib/i18n';
import {setRuntimeLocale} from '@/lib/i18n/runtime';

export type Translate=(key:string,vars?:Record<string,string|number>)=>string;
type Ctx={locale:Locale;t:Translate;tag:string};
const LocaleContext=createContext<Ctx>({locale:DEFAULT_LOCALE,t:(k,v)=>translate(DEFAULT_LOCALE,k,v),tag:LOCALE_TAGS[DEFAULT_LOCALE]});

export function useT(){return useContext(LocaleContext);}

export function LocaleProvider({locale,children}:{locale:Locale;children:ReactNode}){
 // Хуки записи и эфира живут вне дерева и берут язык из модульного состояния.
 // Ставим его до рендера детей, чтобы первое же сообщение об ошибке пришло на
 // нужном языке; повторный вызов с тем же значением ничего не меняет.
 setRuntimeLocale(locale);
 const value=useMemo(()=>({locale,t:(k:string,v?:Record<string,string|number>)=>translate(locale,k,v),tag:LOCALE_TAGS[locale]}),[locale]);
 return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
