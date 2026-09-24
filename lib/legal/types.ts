/**
 * Правовые документы приложения: политика конфиденциальности и правила.
 *
 * Текст лежит отдельно от словаря интерфейса намеренно. Словарь — это
 * надписи на кнопках, их правят походя; документ правят осознанно, целиком и
 * на всех языках сразу, потому что расхождение между языками здесь — это не
 * опечатка, а разные обещания разным людям.
 *
 * Подстановки заполняются из настроек канала, а не зашиты в код: пока автор
 * не назвал себя и адрес для связи, документ показывает это прямо и не
 * притворяется действующим.
 */
export type LegalSection={heading:string;paragraphs?:string[];bullets?:string[]};
export type LegalDoc={title:string;intro:string;sections:LegalSection[]};
export type LegalPack={updated:string;privacy:LegalDoc;rules:LegalDoc};

/** Кем заполняется документ. Пустые значения — законный повод его не публиковать. */
export type LegalParty={controller:string;contact:string;site:string};

/** {controller}, {contact}, {site} — единственные подстановки в текстах. */
export function fill(text:string,party:LegalParty){
 return text.replace(/\{(controller|contact|site)\}/g,(whole,name:'controller'|'contact'|'site')=>party[name]||whole);
}
