import type { Metadata, Viewport } from "next";
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
