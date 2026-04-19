import { CaptureOverlay } from "@/components/capture-overlay";
import { MovementInsightPanel } from "@/components/movement-insight-panel";
import { DEMO_MOVEMENT } from "@/lib/demoMovement";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col gap-8 bg-background p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Live capture
        </h1>
        <p className="text-sm text-muted-foreground">
          Webcam with recovery zone overlay. Normalized pad positions map to canvas pixels on
          resize.
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-8 lg:flex-row lg:items-start">
        <section className="min-w-0 flex-1 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Preview</h2>
          <CaptureOverlay movement={DEMO_MOVEMENT} />
        </section>

        <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:max-w-md">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground lg:sr-only">
            Insights
          </h2>
          <MovementInsightPanel movement={DEMO_MOVEMENT} />
        </aside>
      </div>
    </div>
  );
}
