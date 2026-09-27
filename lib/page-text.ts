/**
 * Разбивка рассказа на строки и страницы.
 *
 * Зачем она своя, а не браузерная. Пока страницы делали колонки CSS, границы
 * знал только браузер: где кончается страница, было видно, но не сказано.
 * Изгиб листа в WebGL берёт страницу картинкой, а картинку надо нарисовать —
 * значит, состав страницы должен быть известен нам самим, строка за строкой.
 *
 * Здесь же считается и то, что показывает настоящий текст на экране: и строки
 * в разметке, и строки на холсте берутся из одного и того же разбора. Иначе на
 * первом же кадре оборота буквы дрогнули бы — на экране одно, на картинке
 * другое.
 *
 * Мерить ширину строки этот файл не умеет намеренно. Настоящую ширину знает
 * только тот, у кого есть шрифт: браузер или холст. Поэтому мерку передают
 * снаружи, а здесь остаётся чистый счёт — его можно проверить без браузера.
 *
 * Высота считается в строках сетки, а не в пикселях: вся читалка стоит на
 * сетке из строк, и целые числа не дают половине букв свисать за край страницы.
 */

export type Kind = 'title' | 'intro' | 'para';

/** Смысловой кусок рассказа: заголовок, вступление или абзац. */
export type Block = {kind: Kind; text: string};

/** Готовая строка на странице. */
export type Line = {
 /** Текст строки — уже по месту, переносить его больше не нужно. */
 text: string;
 kind: Kind;
 /** Первая строка своего куска: по ней рисуется отступ первой строки абзаца. */
 first: boolean;
 /** Сколько строк сетки занимает эта строка. Заголовок — выше остальных. */
 rows: number;
};

export type Page = Line[];

export type Metrics = {
 /** Ширина полосы чтения в пикселях. */
 width: number;
 /** Сколько строк сетки помещается на страницу. */
 rows: number;
 /** Ширина куска текста в пикселях для своего вида. */
 measure: (text: string, kind: Kind) => number;
 /** Сколько строк сетки занимает одна строка своего вида. */
 height: (kind: Kind) => number;
 /** Сколько пустых строк сетки идёт после куска своего вида. */
 after: (kind: Kind) => number;
 /** Отступ первой строки абзаца в пикселях: на неё влезает меньше слов. */
 indent?: number;
};

/**
 * Режет один кусок на строки по настоящей ширине.
 *
 * Жадно: слово переносится, как только строка перестаёт влезать. Слово длиннее
 * всей полосы рвётся по буквам — иначе оно вылезло бы за край, и никакая
 * страница его не удержала бы.
 */
export function wrap(block: Block, metrics: Metrics): Line[] {
 const words = block.text.split(/\s+/).filter(Boolean);
 const rows = Math.max(1, Math.round(metrics.height(block.kind)));
 if (!words.length) return [];
 const lines: Line[] = [];
 let current = '';
 const room = (first: boolean) =>
  metrics.width - (first && block.kind === 'para' ? metrics.indent ?? 0 : 0);
 const push = (text: string) => {
  lines.push({text, kind: block.kind, first: lines.length === 0, rows});
 };
 const fits = (text: string) => metrics.measure(text, block.kind) <= room(!lines.length);
 for (const word of words) {
  const grown = current ? current + ' ' + word : word;
  if (fits(grown)) {current = grown; continue;}
  if (current) {push(current); current = '';}
  // Слово само по себе шире полосы: рвём его по буквам, пока куски не влезут.
  if (fits(word)) {current = word; continue;}
  let rest = word;
  while (rest && !fits(rest)) {
   let take = rest.length - 1;
   while (take > 1 && !fits(rest.slice(0, take))) take--;
   push(rest.slice(0, take));
   rest = rest.slice(take);
  }
  current = rest;
 }
 if (current) push(current);
 return lines;
}

/**
 * Собирает строки в страницы.
 *
 * Страница набирается до предела сетки. Абзац разрывать между страницами можно
 * — так набирают все книги, — а вот заголовок в одиночестве на дне страницы
 * оставлять нельзя: он обязан уйти на следующую вместе со своим текстом.
 *
 * Пустая строка после куска на дне страницы не тратится: место она занимает
 * только между кусками, а не в самом низу.
 */
export function paginate(blocks: Block[], metrics: Metrics): Page[] {
 const limit = Math.max(1, Math.floor(metrics.rows));
 const pages: Page[] = [];
 let page: Page = [];
 let used = 0;
 const close = () => {if (page.length) {pages.push(page); page = []; used = 0;}};
 for (let index = 0; index < blocks.length; index++) {
  const block = blocks[index];
  const lines = wrap(block, metrics);
  if (!lines.length) continue;
  for (let at = 0; at < lines.length; at++) {
   const line = lines[at];
   if (used + line.rows > limit) close();
   // Заголовок не остаётся один на дне страницы: если за ним на этой странице
   // нет места ни для одной строки текста, он уходит целиком на следующую.
   if (block.kind === 'title' && at === lines.length - 1 && used + line.rows >= limit) close();
   page.push(line);
   used += line.rows;
  }
  const gap = Math.max(0, Math.round(metrics.after(block.kind)));
  // Пустая строка нужна только если после неё на странице ещё что-то будет.
  if (gap && index < blocks.length - 1 && used + gap < limit) used += gap;
 }
 close();
 return pages.length ? pages : [[]];
}

/** Из чего состоит рассказ. Пустые строки делят текст на абзацы. */
export function blocksOf(title: string, description: string | undefined, body: string): Block[] {
 const blocks: Block[] = [];
 if (title.trim()) blocks.push({kind: 'title', text: title.trim()});
 if (description && description.trim()) blocks.push({kind: 'intro', text: description.trim()});
 for (const para of body.split(/\n+/)) {
  const text = para.trim();
  if (text) blocks.push({kind: 'para', text});
 }
 return blocks;
}
