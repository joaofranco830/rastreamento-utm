import type { Metadata } from "next";
import { Sora, JetBrains_Mono, Anton } from "next/font/google";
import "./globals.css";

// Fontes da marca (Guia 03 · Escala): Sora (texto/interface), JetBrains Mono
// (dados/métricas), Anton (display/números — sempre CAIXA ALTA).
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
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
      className={`dark ${sora.variable} ${jetbrainsMono.variable} ${anton.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
