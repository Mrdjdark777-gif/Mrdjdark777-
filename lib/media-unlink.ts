import {eq,inArray,or} from 'drizzle-orm';
import {getDb} from '@/db';
import {broadcasts,posts,settings} from '@/db/schema';
import {bucket} from '@/lib/server';
import {MEDIA_SETTING_KEYS} from '@/lib/media-refs.mjs';

/**
 * Удалить файл из хранилища, только если на него больше никто не ссылается.
 *
 * Раньше удаление материала сносило файлы безусловно. Но обложка бывает
 * общей: при старте эфира переиспользуется обложка предыдущего, а воркер
 * переносит её в публикацию. Удаление одной записи оставляло другую в базе с
 * ключом, по которому файл уже отдавал 404. То же и с ключом звука — API
 * разрешает переиспользовать его между выпусками.
 *
 * Вызывать строго ПОСЛЕ удаления строки, которая на файл ссылалась: тогда
 * оставшиеся ссылки и есть ответ на вопрос «файл ещё нужен?».
 */
export async function unlinkIfUnused(key:string|null|undefined){
 if(!key)return false;
 if(await stillReferenced(key))return false;
 await bucket().delete(key);
 return true;
}

/** Ссылается ли на ключ хоть что-нибудь: выпуск, эфир или настройка. */
export async function stillReferenced(key:string){
 const db=getDb();
 if(await db.select({id:posts.id}).from(posts)
  .where(or(eq(posts.audioKey,key),eq(posts.coverKey,key))).get())return true;
 if(await db.select({id:broadcasts.id}).from(broadcasts)
  .where(eq(broadcasts.coverKey,key)).get())return true;
 // Список настроек с картинками — общий со скриптами обслуживания,
 // lib/media-refs.mjs. Их единицы, поэтому читаем значения целиком.
 const rows=await db.select({value:settings.value}).from(settings)
  .where(inArray(settings.key,[...MEDIA_SETTING_KEYS])).all();
 return rows.some(row=>row.value===key);
}
