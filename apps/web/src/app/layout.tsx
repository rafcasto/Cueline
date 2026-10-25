import type { Metadata } from "next";
import { NavigationProgress } from "@/components/NavigationProgress";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Tertulia", template: "%s · Tertulia" },
  description: "Live communities in the browser. Find a session, register with a name and an email, and take part with polls, quizzes, chat and Q&A on the slide.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col bg-surface-sunken text-ink">
        <NavigationProgress />
        {children}
      </body>
    </html>
  );
}
