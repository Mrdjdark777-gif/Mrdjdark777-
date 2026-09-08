import {cookies, headers} from 'next/headers';
import {LOCALE_COOKIE, resolveLocale, type Locale} from './index';

/** Язык текущего запроса: ручной выбор из cookie, иначе язык телефона. */
export async function currentLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get('accept-language'));
}
