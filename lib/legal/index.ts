import {DEFAULT_LOCALE,type Locale} from '@/lib/i18n';
import type {LegalPack,LegalParty} from './types';
import {ru} from './ru';
import {uk} from './uk';
import {ro} from './ro';
import {it} from './it';

export type {LegalDoc,LegalSection,LegalPack,LegalParty} from './types';
export {fill} from './types';

const PACKS: Record<Locale,LegalPack> = {ru,uk,ro,it};
export function legalPack(locale: Locale): LegalPack { return PACKS[locale] ?? PACKS[DEFAULT_LOCALE]; }

/**
 * Документ действителен только когда автор назвал себя и адрес для связи.
 * Пока их нет, страница обязана сказать это прямо: политика без ответственного
 * лица и без канала для запросов — не политика, а её макет.
 */
export function partyReady(party: LegalParty) { return !!party.controller.trim() && !!party.contact.trim(); }
