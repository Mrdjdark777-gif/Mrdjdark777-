/**
 * Значок Android для ссылки на приложение. Собственный, а не из набора иконок:
 * в lucide фирменных знаков нет, а человеку нужно с одного взгляда понять, что
 * файл для телефона на Android, а не для iPhone.
 *
 * Глаза вырезаны правилом evenodd, а не закрашены цветом фона: иначе на другом
 * фоне они превратились бы в два светлых пятна.
 */
export function AndroidMark({size=19}:{size?:number}){
 return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
   <path d="M8.2 3.4 9.7 6.1"/><path d="M15.8 3.4 14.3 6.1"/>
  </g>
  <path fill="currentColor" fillRule="evenodd"
   d="M5 11a7 7 0 0 1 14 0v.5H5V11Zm4.4-1.7a.95.95 0 1 1 0-1.9.95.95 0 0 1 0 1.9Zm5.2 0a.95.95 0 1 1 0-1.9.95.95 0 0 1 0 1.9Z"/>
  <rect fill="currentColor" x="5" y="12.4" width="14" height="7.2" rx="1.7"/>
 </svg>;
}
