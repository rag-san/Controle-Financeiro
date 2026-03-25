import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppProviders } from "@/src/components/layout/AppProviders";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata: Metadata = {
  title: "Finance Control",
  description: "Personal finance dashboard with CSV/OFX/PDF imports"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${jetbrainsMono.variable} ${inter.className} overflow-x-hidden`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}


