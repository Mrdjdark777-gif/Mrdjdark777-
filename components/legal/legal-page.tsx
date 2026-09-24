import type {Metadata} from 'next';
import Link from 'next/link';
import {translate,type Locale} from '@/lib/i18n';
import {currentLocale} from '@/lib/i18n/server';
import {legalPack,partyReady,fill,type LegalDoc,type LegalParty} from '@/lib/legal';
import {setting} from '@/lib/server';
import './legal.css';

/**
 * Одна страница на оба документа: политику и правила. Различаются они только
 * текстом, а всё остальное — язык, подстановки, предупреждение о незаполненном
 * документе — устроено одинаково, и разводить это по двум файлам значило бы
 * чинить потом в двух местах.
 */
async function party(): Promise<LegalParty> {
  const [controller, contact] = await Promise.all([setting('legalName'), setting('legalContact')]);
  const site = (process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  return {controller, contact, site};
}

export async function legalMetadata(kind: 'privacy' | 'rules'): Promise<Metadata> {
  const locale = await currentLocale();
  return {title: legalPack(locale)[kind].title + ' — True Thrills', robots: {index: true, follow: true}};
}

export async function LegalPage({kind}: {kind: 'privacy' | 'rules'}) {
  const locale: Locale = await currentLocale();
  const pack = legalPack(locale);
  const doc: LegalDoc = pack[kind];
  const who = await party();
  const ready = partyReady(who);
  const t = (key: string) => translate(locale, key);
  const text = (value: string) => fill(value, who);
  return <main className="legal-page">
    <nav className="legal-nav"><Link href="/?mode=listen&view=home">← True Thrills</Link>
      <Link href={kind === 'privacy' ? '/rules' : '/privacy'}>{pack[kind === 'privacy' ? 'rules' : 'privacy'].title}</Link></nav>
    <h1>{doc.title}</h1>
    <p className="legal-updated">{t('legal.updated')}: {pack.updated}</p>
    {!ready && <p className="legal-draft" role="status">{t('legal.draft')}</p>}
    <p className="legal-intro">{text(doc.intro)}</p>
    {doc.sections.map(section => <section key={section.heading}>
      <h2>{section.heading}</h2>
      {(section.paragraphs ?? []).map(p => <p key={p}>{text(p)}</p>)}
      {!!section.bullets?.length && <ul>{section.bullets.map(b => <li key={b}>{text(b)}</li>)}</ul>}
    </section>)}
    <footer className="legal-foot">© {new Date().getFullYear()} True Thrills</footer>
  </main>;
}
