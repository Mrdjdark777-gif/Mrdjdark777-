/**
 * Кто ссылается на файлы в хранилище.
 *
 * Список был размазан по трём местам, и они разошлись: уборка и проверка
 * копии знали про `channelArt`, но не про `calmArt`. Итог — картинка круга
 * покоя, на которую ссылается настройка, считалась ничьей и удалялась, а
 * проверка резервной копии этого не замечала и отвечала «всё цело».
 *
 * Поэтому источник правды один и лежит здесь. Добавляешь настройку с
 * картинкой — дописываешь её сюда, и уборка, проверка копии и удаление
 * узнают о ней разом. tests/media-refs.mjs следит, чтобы ни одно из этих
 * мест не собирало ссылки самостоятельно.
 */

/** Настройки, значение которых — ключ файла в хранилище. */
export const MEDIA_SETTING_KEYS=['channelArt','calmArt'];

/**
 * Все ключи файлов, на которые есть ссылка. Для вызывающих с обычным
 * better-sqlite3 (скрипты обслуживания).
 *
 * `skipBroadcasts` — эфиры, которые удаляются этим же проходом: их обложка
 * тоже становится ничьей, иначе скрипт пришлось бы запускать дважды.
 */
export function referencedMediaKeys(db,{skipBroadcasts=new Set()}={}){
 const used=new Set();
 const has=(table)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
 const column=(table,name)=>db.prepare('PRAGMA table_info('+table+')').all().some(c=>c.name===name);
 if(has('posts'))for(const row of db.prepare('SELECT audio_key, cover_key FROM posts').all()){
  if(row.audio_key)used.add(row.audio_key);
  if(row.cover_key)used.add(row.cover_key);
 }
 if(has('broadcasts')&&column('broadcasts','cover_key'))
  for(const row of db.prepare('SELECT id, cover_key FROM broadcasts').all())
   if(row.cover_key&&!skipBroadcasts.has(row.id))used.add(row.cover_key);
 if(has('settings'))for(const key of MEDIA_SETTING_KEYS){
  const row=db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if(row?.value)used.add(row.value);
 }
 return used;
}
