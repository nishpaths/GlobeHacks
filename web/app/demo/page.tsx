import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CaptureOverlay } from "@/components/capture-overlay";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function DemoPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.32em] text-white/45">
            Recovery Intelligence
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Capture, Analyze, Review
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-white/60">
            This screen now runs as a controlled workflow: frame the athlete, capture one short
            movement window, then review a frozen recovery result with stable pad guidance and
            protocol output.
          </p>
        </div>
        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "inline-flex shrink-0 gap-2 border-white/15 bg-white/5 text-white hover:bg-white/10",
          )}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to landing
        </Link>
      </header>

      <CaptureOverlay className="pb-10" />
    </main>
  );
}
