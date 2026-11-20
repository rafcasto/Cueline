import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Analytics } from "@/components/Analytics";
import { NavigationProgress } from "@/components/NavigationProgress";
import "./globals.css";

/*
 * The brand's two families, self-hosted by next/font so there is no request to Google at
 * run time and no flash of fallback type: Fraunces for headings (the variable font, so weight
 * 600 and the optical-size axis come from the CSS), Inter 400 and 600 for body and interface.
 */
const heading = Fraunces({ subsets: ["latin"], axes: ["opsz", "SOFT"], variable: "--font-heading", display: "swap" });
const body = Inter({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Tertulia", template: "%s · Tertulia" },
  description: "Join live conversations that matter. Find a room, meet people who care about the same things, and join the next live session from any browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${heading.variable} ${body.variable}`}>
      <body className="flex min-h-full flex-col bg-surface-sunken font-sans text-ink">
        <NavigationProgress />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
