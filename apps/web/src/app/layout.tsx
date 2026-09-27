import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cueline",
  description: "Webinars where the slides drive the engagement.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">{children}</body>
    </html>
  );
}
