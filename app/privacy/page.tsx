import {LegalPage,legalMetadata} from '@/components/legal/legal-page';
export const dynamic='force-dynamic';
export async function generateMetadata(){return legalMetadata('privacy');}
export default function PrivacyPage(){return <LegalPage kind="privacy"/>;}
