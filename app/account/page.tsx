import type {Metadata} from 'next';
import {translate} from '@/lib/i18n';
import {currentLocale} from '@/lib/i18n/server';
import {ListenerProfile} from '@/components/community/community';
export async function generateMetadata():Promise<Metadata>{
 const locale=await currentLocale();
 return {title:translate(locale,'community.pageTitle'),robots:{index:false,follow:false}};
}
export default function AccountPage(){return <main style={{maxWidth:680,margin:'24px auto',padding:16}}><ListenerProfile/></main>;}
