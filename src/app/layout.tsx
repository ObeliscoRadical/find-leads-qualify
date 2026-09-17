import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Captação de Leads",
  description: "Plataforma de campanhas e captação de leads",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt"
      className="antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
