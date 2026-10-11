import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Captação de Leads",
  description: "Plataforma de campanhas e captação de leads",
  icons: {
    icon: [{ url: "/icons/find-leads-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/find-leads-apple-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Find Leads", statusBarStyle: "default" },
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
