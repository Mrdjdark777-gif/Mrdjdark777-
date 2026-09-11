import {ru} from './ru';
import {it} from './it';
import {uk} from './uk';
import {ro} from './ro';

export const LOCALES = ['ru', 'it', 'uk', 'ro'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ru';
/** Тег для toLocaleDateString и атрибута lang. */
export const LOCALE_TAGS: Record<Locale, string> = {ru: 'ru-RU', it: 'it-IT', uk: 'uk-UA', ro: 'ro-MD'};

export type Dict = typeof ru;
export type Key = keyof Dict;
const DICTS: Record<Locale, Dict> = {ru, it, uk, ro};

/**
 * Устаревшие и региональные коды, которые телефон может прислать вместо
 * нашего. «mo» — снятый с учёта код молдавского: в Молдове государственный
 * язык румынский, и словарь у них общий.
 */
const ALIASES: Record<string, Locale> = {mo: 'ro', mol: 'ro', ukr: 'uk', rus: 'ru', ita: 'it', ron: 'ro', rum: 'ro'};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Язык интерфейса — это язык телефона, и только он: ручного выбора в
 * приложении нет. Берём из Accept-Language первый тег, который мы понимаем,
 * сравнивая по базовому языку, чтобы it-CH считался итальянским, а ro-MD —
 * румынским. Если не совпало ничего — язык автора.
 */
export function localeFromHeader(header: string | null | undefined): Locale {
  for (const part of String(header ?? '').split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase();
    if (!tag) continue;
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
    if (ALIASES[base]) return ALIASES[base];
  }
  return DEFAULT_LOCALE;
}

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const dict = (DICTS[locale] ?? DICTS[DEFAULT_LOCALE]) as Record<string, string>;
  const raw = dict[key] ?? (DICTS[DEFAULT_LOCALE] as Record<string, string>)[key];
  if (raw === undefined) return key;
  return vars ? raw.replace(/\{(\w+)\}/g, (whole, name: string) => String(vars[name] ?? whole)) : raw;
}
