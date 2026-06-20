import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rastreamento UTM — Franco Advertising",
  description: "Ferramenta de rastreamento por UTM para funis de tráfego",
};

// Roda as funções em São Paulo (gru1), ao lado do Supabase (sa-east-1) —
// corta a latência de cada round-trip ao banco (antes ia/voltava de iad1/EUA).
export const preferredRegion = "gru1";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
