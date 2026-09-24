import {LegalPage,legalMetadata} from '@/components/legal/legal-page';
export const dynamic='force-dynamic';
export async function generateMetadata(){return legalMetadata('rules');}
export default function RulesPage(){return <LegalPage kind="rules"/>;}
