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
  // Pages set their own fully-qualified titles (e.g. "Firm overview · Agentic
  // Prop"), so no template here — it would double the suffix.
  title: "Agentic Prop",
  description: "AI-native proprietary trading platform — multi-asset execution, agentic research and pre-trade risk.",
};

/**
 * The terminal is dark-first: `dark` is set on <html> so the Tailwind tokens in
 * globals.css resolve to the dark palette without a client-side flash.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
