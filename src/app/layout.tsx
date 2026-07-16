import type { Metadata, Viewport } from "next";
import "./globals.css";

// System font stack only — no web fonts. The play page must render
// instantly on low-end Android over 3G; font downloads are not allowed
// on that path.
export const metadata: Metadata = {
  title: "EngageOS",
  description: "Scratch & Win campaigns for offline businesses",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fffbeb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
