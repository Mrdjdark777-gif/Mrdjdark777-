import type { Metadata, Viewport } from "next";
import { LOCALE_TAGS, translate } from "@/lib/i18n";
import { currentLocale } from "@/lib/i18n/server";
import { LocaleProvider } from "@/components/i18n-provider";
import { Lora, Manrope } from "next/font/google";
import "./globals.css";

// viewport-fit=cover makes the browser report real safe-area insets, which the
// header and bottom nav pad themselves by. Needed because Android 15 draws the
// app's WebView behind the status bar, which otherwise covers the header.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Три роли шрифта из утверждённого листа: спокойный интерфейс, серьёзный serif
// на фотографических экранах и плотный узкий гротеск в «Голосе». Различие
// намеренное — сводить всё к одному шрифту нельзя.
//
// У всех трёх обязательны подмножества latin-ext и cyrillic: без них румынские
// ș и ț или русский текст подставились бы системным шрифтом, и приложение
// выглядело бы по-разному на разных телефонах. Все три под SIL Open Font
// License, файлы раздаёт сам сервер через next/font — внешних загрузок во
// время работы нет.
const uiFont = Manrope({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-display",
  display: "swap",
});

// Serif для названий выпусков на фотографических экранах. ТЗ допускало Prata,
// но у неё нет latin-ext: румынские ș и ț выпали бы из заголовка. Lora покрывает
// все четыре языка — проверка языков и решила выбор.
const editorialFont = Lora({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-editorial",
  display: "swap",
});


export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  return {
    title: translate(locale, "meta.title"),
    description: translate(locale, "meta.description"),
    manifest: "/manifest.webmanifest",
    icons: {
      icon: "/favicon.ico?v=0.4.1",
      shortcut: "/favicon.ico?v=0.4.1",
    },
  };
}

// Язык берётся из ручного выбора (cookie), иначе из Accept-Language, который
// WebView присылает по языку телефона. Решение принимается на сервере, чтобы
// первый же кадр был на нужном языке и разметка совпала при гидратации.
const TABLET_AS_PHONE=`(function(){try{
var BASE='width=device-width, initial-scale=1, viewport-fit=cover';
var touch=matchMedia('(hover: none) and (pointer: coarse)');
function meta(){var m=document.querySelector('meta[name="viewport"]');
 if(!m){m=document.createElement('meta');m.name='viewport';m.content=BASE;document.head.appendChild(m);}
 return m;}
function fit(){
 meta();var a=screen.width,b=screen.height,small=Math.min(a,b),big=Math.max(a,b),c=BASE;
 if(touch.matches&&small>=600){
  var portrait=b>=a;
  // Стоя: ширина такая, чтобы первый экран главной поместился целиком, как
  // на телефоне. Он занимает ~560 точек плюс постер (7/15 ширины), а высота
  // экрана — ширина × (h/w). Отсюда ширина = 560 / (h/w − 7/15), но не уже
  // 430 и не шире 700: экран планшета короче телефонного (1,33–1,6 против
  // 2,1), и при постоянных 430 названия карусели уходили под панель.
  var narrow=Math.max(430,Math.min(700,Math.ceil(560/(big/small-7/15))));
  // Боком — тот же масштаб, что стоя: буквы и кнопки той же величины, а
  // ширина — весь экран. Никакой колонки посередине: владелец просил
  // полноэкранное приложение в любом положении.
  var W=portrait?narrow:Math.round(big*narrow/small),k=(small/narrow).toFixed(4);
  // Масштаб задан явно и закреплён (min = max). Без него браузер, увидев
  // содержимое шире заявленной ширины (читалка успевает отрисоваться по
  // первому кадру во всю ширину), сам отдалял страницу и возвращал ей ширину
  // экрана — планшет снова рисовал свою раскладку, а не телефон.
  c='width='+W+', initial-scale='+k+', minimum-scale='+k+', maximum-scale='+k+', viewport-fit=cover';
 }
 // Каждый тег ширины, а не только первый: Next.js может дописать свой позже, и
 // браузер слушает последний.
 // Та же ширина другим порядком слов (её пишет самопроверка ниже) — это не
 // расхождение, и откатывать её нельзя, иначе они спорили бы друг с другом.
 var same=function(v){return c!==BASE&&!!v&&v.split(/,\s*/).sort().join()===c.split(/,\s*/).sort().join();};
 document.querySelectorAll('meta[name="viewport"]').forEach(function(x){var v=x.getAttribute('content');if(v!==c&&!same(v))x.setAttribute('content',c);});
 document.documentElement.toggleAttribute('data-tt-tablet',c!==BASE);
 // Полный экран (читалка). Браузер в нём может забыть meta viewport и
 // вернуть странице ширину планшета — тогда читалка увеличивается ровно во
 // столько раз, во сколько страница стала шире заявленной (story-reader.css).
 // Считается по факту, а не заранее: если оболочка ширину сохранит, увеличения
 // не будет и читалка не раздуется вдвое.
 var html=document.documentElement,fz=document.fullscreenElement&&c!==BASE?html.clientWidth/W:1;
 html.toggleAttribute('data-tt-fs-zoom',fz>1.02);
 html.style.setProperty('--tt-fs-zoom',fz>1.02?fz.toFixed(4):'1');
 if(c!==BASE)setTimeout(check,120);
}
// Самопроверка. Next.js дописывает свой тег ширины позже, и изредка браузер не
// перечитывает тег после правки: в разметке 646, а страница осталась шириной
// 1024. Тогда тот же смысл пишется другим порядком слов — новая строка
// браузер перечитывает наверняка.
var tries=0;
function check(){
 var m=document.querySelector('meta[name="viewport"]');if(!m)return;
 var want=/width=(\d+)/.exec(m.getAttribute('content')||'');if(!want)return;
 // В полноэкранном режиме ширину из meta браузер не слушает нарочно — это не
 // сбой, и переписывать тег незачем.
 if(document.fullscreenElement||Math.abs(document.documentElement.clientWidth-Number(want[1]))<=2){tries=0;return;}
 if(++tries>5)return;
 var c=m.getAttribute('content'),parts=c.split(/,\s*/),alt=(c.indexOf('width=')===0?parts.slice(1).concat(parts[0]):[parts[parts.length-1]].concat(parts.slice(0,-1))).join(', ');
 document.querySelectorAll('meta[name="viewport"]').forEach(function(x){x.setAttribute('content',alt);});
 setTimeout(check,150);
}
fit();
document.addEventListener('DOMContentLoaded',fit);addEventListener('load',fit);
addEventListener('resize',fit);document.addEventListener('fullscreenchange',fit);addEventListener('orientationchange',function(){setTimeout(fit,60)});
new MutationObserver(function(){if(touch.matches&&Math.min(screen.width,screen.height)>=600)fit();})
 .observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:['content']});
}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await currentLocale();
  return (
    <html lang={LOCALE_TAGS[locale]} className={`dark ${uiFont.variable} ${editorialFont.variable}`}>
      <body className="antialiased">
        {/* Планшет — тот же телефон. Стоя ширина экрана объявляется
            телефонной (430–700 точек — так, чтобы первый экран главной вошёл целиком), и
            планшет рисует телефонный экран, увеличенный на всю ширину, родным
            масштабированием. Боком — тот же масштаб и весь экран в ширину
            (раскладка боком — в globals.css). Телефоны (меньшая сторона меньше
            600 точек) и ПК с мышью не трогаются. Скрипт стоит до приложения,
            чтобы первый кадр уже был в нужном масштабе. */}
        <script dangerouslySetInnerHTML={{__html:TABLET_AS_PHONE}}/>
        <div aria-hidden className="app-aurora">
          <span className="tt-blob-1" />
          <span className="tt-blob-2" />
          <span className="tt-blob-3" />
          <span className="tt-vignette" />
          <span className="tt-noise" />
        </div>
        <div id="tt-app"><LocaleProvider locale={locale}>{children}</LocaleProvider></div>
      </body>
    </html>
  );
}
