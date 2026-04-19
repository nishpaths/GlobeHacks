import type { Metadata } from "next";
import { DM_Sans, Fraunces, JetBrains_Mono } from "next/font/google";

import "./landing.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-landing-sans",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-landing-display",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-landing-mono",
});

export const metadata: Metadata = {
  title: "Telemetry — Biomechanics for serious training",
  description:
    "Real-time movement insight, symmetry checks, and session context—built for coaches and athletes who care about precision.",
};

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className={`${dmSans.variable} ${fraunces.variable} ${jetbrainsMono.variable} landing-root dark min-h-screen font-[family-name:var(--font-landing-sans)] text-zinc-100 antialiased`}
    >
      {children}
    </div>
  );
}
