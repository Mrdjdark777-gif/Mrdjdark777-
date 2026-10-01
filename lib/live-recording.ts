import {readFile,statfs} from 'node:fs/promises';
import path from 'node:path';
/**
 * Папка, где лежат куски и готовые записи эфира.
 *
 * Путь известен только при запуске: его задаёт LIVE_DIR в .env сервера. Сборщик
 * же разбирает код заранее и, увидев рядом чтение файлов по непонятному ему
 * пути, на всякий случай тащил в серверную сборку весь проект целиком, включая
 * public. Он сам об этом предупреждал: «Dynamic filesystem access causes
 * tracing of the whole project».
 *
 * Прослеживать тут нечего: это каталог с данными, а не модули, которые нужно
 * сложить в сборку. Пометка говорит сборщику не ходить за этим путём. На
 * работу она не влияет — путь как читался при запуске, так и читается.
 */
export const liveRoot=()=>path.resolve(/*turbopackIgnore: true*/ process.env.LIVE_DIR||'data/live');
export const liveId=(id:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
/**
 * Сколько слушателей пускает штатное подключение через интерфейс.
 *
 * Это предел на вход, а не потолок раздачи: плейлист и сегменты HLS отдаются
 * всем, кто знает ссылку, и делать иначе — значит ставить новую точку отказа
 * прямо в тракт живого звука. Контент бесплатный, скрывать нечего; цифра
 * бережёт сервер, а не выручку. Поднимать её без нужды не стоит, но и врать,
 * что она гарантированный потолок, нельзя.
 */
export function liveListenerLimit(){
 const raw=process.env.LIVE_LISTENER_LIMIT;
 if(raw===undefined)return 50;
 const value=Number(raw);
 if(!Number.isInteger(value)||value<1)throw new Error('LIVE_LISTENER_LIMIT должен быть целым числом больше нуля.');
 return value;
}
export async function recordingAvailable(){
 try {const h=JSON.parse(await readFile(path.join(/*turbopackIgnore: true*/ liveRoot(),'worker.json'),'utf8'));return Date.now()-h.at<20000;}catch{return false;}
}
export async function requireRecordingCapacity(){
 if(!await recordingAvailable())throw new Error('#err.liveWorker');
 const fs=await statfs(liveRoot());if(fs.bavail*fs.bsize<1024**3)throw new Error('#err.liveDisk');
}
