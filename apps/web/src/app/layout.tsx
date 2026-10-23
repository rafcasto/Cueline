import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Cueline", template: "%s · Cueline" },
  description: "Live webinars with polls, quizzes and Q&A built into the slides.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col bg-surface-sunken text-ink">{children}</body>
    </html>
  );
}
