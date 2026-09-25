import type {MetadataRoute} from 'next';

/**
 * Сайт открыт для поиска — на него и приходят за каналом. Закрыты только те
 * адреса, которым в выдаче делать нечего: вход в студию, страница профиля и
 * весь API. Без этого файла поисковик обходил и их.
 */
export default function robots(): MetadataRoute.Robots {
  const site = (process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  return {
    rules: [{userAgent: '*', allow: '/', disallow: ['/login', '/account', '/api/']}],
    ...(site ? {host: site} : {}),
  };
}
