import {DEFAULT_LOCALE, translate, type Locale} from './index';

// Клиентский код вне дерева React (хуки записи и эфира, разбор ошибок сети)
// не может дотянуться до контекста, поэтому активный язык хранится здесь.
// На сервере это значение не читается: серверные строки переводятся по языку
// конкретного запроса, а не по глобальному состоянию.
let current: Locale = DEFAULT_LOCALE;

export function setRuntimeLocale(locale: Locale) {
  current = locale;
}

export function t(key: string, vars?: Record<string, string | number>) {
  return translate(current, key, vars);
}

export function runtimeLocale() {
  return current;
}
