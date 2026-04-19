"use client";

import Image from "next/image";
import Link from "next/link";
import { Bone, Cpu, ScanLine, Scale } from "lucide-react";
import { useCallback, useState } from "react";

import { MuscleSilhouettes } from "@/components/landing/muscle-silhouettes";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const display = "font-[family-name:var(--font-landing-display)]";
const mono = "font-[family-name:var(--font-landing-mono)]";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=2000&q=85";

export function LandingView() {
  const [shift, setShift] = useState({ x: 0, y: 0 });

  const onPageMove = useCallback((e: React.MouseEvent) => {
    const nx = e.clientX / window.innerWidth - 0.5;
    const ny = e.clientY / window.innerHeight - 0.5;
    setShift({ x: nx * 14, y: ny * 10 });
  }, []);

  const onPageLeave = useCallback(() => setShift({ x: 0, y: 0 }), []);

  return (
    <div
      className="relative isolate min-h-screen overflow-x-hidden"
      onMouseMove={onPageMove}
      onMouseLeave={onPageLeave}
    >
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <Image
          src={HERO_IMAGE}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_28%]"
          style={{
            transform: `translate3d(${shift.x * 0.35}px, ${shift.y * 0.28}px, 0) scale(1.07)`,
          }}
        />
      </div>
      {/* Scrims: keep navy / cyan / violet look over the photo */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[#05060a]/88" />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-br from-cyan-950/35 via-transparent to-violet-950/45" />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-[#05060a] via-[#05060a]/55 to-[#05060a]/75" />

      <div className="landing-grid-bg pointer-events-none absolute inset-0 z-[2] opacity-[0.35]" />
      <MuscleSilhouettes className="z-[2]" />
      <div className="landing-noise pointer-events-none absolute inset-0 z-[3] opacity-[0.12]" />

      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#05060a]/45 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className={cn(display, "text-lg font-medium tracking-tight text-white")}
          >
            Telemetry
          </Link>
          <nav
            className="hidden items-center gap-8 text-sm text-zinc-400 md:flex"
            aria-label="Primary"
          >
            <a className="transition hover:text-white" href="#features">
              Features
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/demo"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "border-white/15 bg-white/5 text-white hover:bg-white/10",
              )}
            >
              Live demo
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-8 pt-5 sm:px-6 sm:pb-10 sm:pt-6 lg:pb-12 lg:pt-7">
        <div className="flex flex-col gap-12 sm:gap-14 lg:gap-16">
          <section className="relative">
            <div
              className="pointer-events-none absolute -left-10 -top-10 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl"
              style={{
                transform: `translate3d(${shift.x * 0.6}px, ${shift.y * 0.6}px, 0)`,
              }}
            />
            <div
              className="pointer-events-none absolute -bottom-6 right-0 h-64 w-64 rounded-full bg-violet-600/25 blur-3xl"
              style={{
                transform: `translate3d(${-shift.x * 0.4}px, ${shift.y * 0.5}px, 0)`,
              }}
            />

            <p
              className={cn(
                mono,
                "mb-3 text-xs uppercase tracking-[0.35em] text-cyan-300/90",
              )}
            >
              Live biomechanics
            </p>
            <h1
              className={cn(
                display,
                "max-w-xl text-4xl font-medium leading-[1.08] tracking-tight text-white sm:text-5xl",
              )}
            >
              Maximize performance. Protect recovery.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-zinc-400">
              Session-grade pose pipelines, symmetry scoring, and tissue-style load
              readouts—presented like instrumentation you would trust in a lab, not a
              toy dashboard.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/demo"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "landing-cta-shimmer h-11 min-w-[220px] border-0 bg-gradient-to-r from-cyan-500 via-sky-600 to-violet-600 px-6 text-white shadow-[0_0_32px_rgba(56,189,248,0.35)] hover:from-cyan-400 hover:via-sky-500 hover:to-violet-500",
                )}
              >
                Open the live capture demo
              </Link>
              <a
                href="#features"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-11 border-white/15 bg-white/5 text-white hover:bg-white/10",
                )}
              >
                How it works
              </a>
            </div>
          </section>

          <section aria-labelledby="features" className="scroll-mt-24 lg:scroll-mt-28">
            <div className="space-y-4 sm:space-y-5">
              <h2
                id="features"
                className={cn(display, "text-2xl font-medium text-white sm:text-3xl")}
              >
                Built for precision, not vibes
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 lg:gap-4">
                {[
                  {
                    title: "Biomechanic precision",
                    body: "Joint-angle reasoning with outlier dampening so one bad frame does not wreck the story.",
                    icon: Bone,
                  },
                  {
                    title: "Real-time tissue mapping",
                    body: "Heat-style emphasis on regions of interest—readable at a glance on the sideline.",
                    icon: ScanLine,
                  },
                  {
                    title: "Symmetry & balance",
                    body: "Left/right deltas surfaced as first-class signals, not buried in a CSV export.",
                    icon: Scale,
                  },
                  {
                    title: "Smart intervention cues",
                    body: "Pipeline events you can trust: clear thresholds, explainable warnings.",
                    icon: Cpu,
                  },
                ].map(({ title, body, icon: Icon }) => (
                  <Card
                    key={title}
                    className="border-white/10 bg-zinc-950/50 backdrop-blur-sm transition hover:border-cyan-500/30 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.2)]"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-600/20 ring-1 ring-white/10">
                          <Icon className="size-4 text-cyan-200" aria-hidden />
                        </span>
                        <div>
                          <CardTitle className="text-base text-white">{title}</CardTitle>
                          <CardDescription className="text-zinc-400">{body}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 bg-[#05060a]/65 py-7 backdrop-blur-md sm:py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className={cn(mono, "text-xs text-zinc-500")}>
            © {new Date().getFullYear()} Telemetry demo. Photography via Unsplash.
          </p>
          <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
            <a className="hover:text-zinc-300" href="#">
              About
            </a>
            <a className="hover:text-zinc-300" href="#">
              Contact
            </a>
            <a className="hover:text-zinc-300" href="#">
              Terms
            </a>
            <Link className="text-cyan-400/90 hover:text-cyan-300" href="/demo">
              Live demo →
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}