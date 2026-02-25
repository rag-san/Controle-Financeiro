import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppProviders } from "@/components/layout/AppProviders";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Financial Control",
  description: "Personal finance dashboard with CSV/OFX/PDF imports"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${inter.className} overflow-x-hidden`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}


