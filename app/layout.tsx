import type { Metadata, Viewport } from "next";
import { LOCALE_TAGS, translate } from "@/lib/i18n";
import { currentLocale } from "@/lib/i18n/server";
import { LocaleProvider } from "@/components/i18n-provider";
import { Lora, Manrope, Roboto_Condensed } from "next/font/google";
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

const condensedFont = Roboto_Condensed({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-condensed",
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
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await currentLocale();
  return (
    <html lang={LOCALE_TAGS[locale]} className={`dark ${uiFont.variable} ${editorialFont.variable} ${condensedFont.variable}`}>
      <body className="antialiased">
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
