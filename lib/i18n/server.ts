import {headers} from 'next/headers';
import {localeFromHeader, type Locale} from './index';

/** Язык текущего запроса — язык телефона. Выбора в приложении нет. */
export async function currentLocale(): Promise<Locale> {
  return localeFromHeader((await headers()).get('accept-language'));
}
