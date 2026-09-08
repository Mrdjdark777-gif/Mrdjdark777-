import type { Metadata, Viewport } from "next";
import { LOCALE_TAGS, translate } from "@/lib/i18n";
import { currentLocale } from "@/lib/i18n/server";
import { LocaleProvider } from "@/components/i18n-provider";
import { Bitter } from "next/font/google";
import "./globals.css";

// viewport-fit=cover makes the browser report real safe-area insets, which the
// header and bottom nav pad themselves by. Needed because Android 15 draws the
// app's WebView behind the status bar, which otherwise covers the header.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const displayFont = Bitter({
  subsets: ["latin", "cyrillic"],
  weight: ["700", "800"],
  variable: "--font-display",
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
    <html lang={LOCALE_TAGS[locale]} className={`dark ${displayFont.variable}`}>
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
