import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="ru" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
