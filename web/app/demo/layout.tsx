import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live capture demo · HydraWave Recovery Intelligence",
  description:
    "Frame the athlete, capture a short movement window, and review recovery output with pad guidance and protocol cues.",
};

export default function DemoLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
