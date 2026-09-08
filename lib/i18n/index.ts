import {ru} from './ru';
import {it} from './it';

export const LOCALES = ['ru', 'it'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ru';
/** Названия языков пишутся на самом языке — так их узнают, не понимая интерфейса. */
export const LOCALE_NAMES: Record<Locale, string> = {ru: 'Русский', it: 'Italiano'};
/** Тег для toLocaleDateString и атрибута lang. */
export const LOCALE_TAGS: Record<Locale, string> = {ru: 'ru-RU', it: 'it-IT'};

export type Dict = typeof ru;
export type Key = keyof Dict;
const DICTS: Record<Locale, Dict> = {ru, it};

export const LOCALE_COOKIE = 'tt_lang';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Язык телефона приходит в Accept-Language. Берём первый тег, который мы
 * поддерживаем; сравниваем по базовому языку, чтобы it-CH тоже считался
 * итальянским. Если ничего не подошло — язык автора.
 */
export function localeFromHeader(header: string | null | undefined): Locale {
  for (const part of String(header ?? '').split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase();
    if (!tag) continue;
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Ручной выбор языка (cookie) имеет приоритет над языком телефона. */
export function resolveLocale(cookie: string | null | undefined, header: string | null | undefined): Locale {
  return isLocale(cookie) ? cookie : localeFromHeader(header);
}

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const dict = (DICTS[locale] ?? DICTS[DEFAULT_LOCALE]) as Record<string, string>;
  const raw = dict[key] ?? (DICTS[DEFAULT_LOCALE] as Record<string, string>)[key];
  if (raw === undefined) return key;
  return vars ? raw.replace(/\{(\w+)\}/g, (whole, name: string) => String(vars[name] ?? whole)) : raw;
}
