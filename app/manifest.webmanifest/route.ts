import {translate} from '@/lib/i18n';
import {currentLocale} from '@/lib/i18n/server';

// Манифест отдаётся маршрутом, а не статикой, чтобы название и описание при
// установке PWA приходили на языке телефона.
export const dynamic = 'force-dynamic';

export async function GET() {
  const locale = await currentLocale();
  return Response.json({
    id: '/',
    name: 'True Thrills',
    short_name: 'True Thrills',
    lang: locale,
    description: translate(locale, 'meta.description'),
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#101113',
    theme_color: '#101113',
    icons: [
      {src: '/icon-192.png?v=0.4.1', sizes: '192x192', type: 'image/png', purpose: 'any'},
      {src: '/icon-512.png?v=0.4.1', sizes: '512x512', type: 'image/png', purpose: 'any'},
    ],
  }, {headers: {'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store'}});
}
