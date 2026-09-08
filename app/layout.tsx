import type { Metadata } from "next";
import { Bitter } from "next/font/google";
import "./globals.css";

const displayFont = Bitter({
  subsets: ["latin", "cyrillic"],
  weight: ["700", "800"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "True Thrills — студия и подкасты",
  description: "Подкасты, истории и прямые эфиры True Thrills.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.ico?v=0.4.1",
    shortcut: "/favicon.ico?v=0.4.1",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`dark ${displayFont.variable}`}>
      <body className="antialiased">
        <div aria-hidden className="app-aurora">
          <span className="tt-blob-1" />
          <span className="tt-blob-2" />
          <span className="tt-blob-3" />
          <span className="tt-vignette" />
          <span className="tt-noise" />
        </div>
        <div id="tt-app">{children}</div>
      </body>
    </html>
  );
}
