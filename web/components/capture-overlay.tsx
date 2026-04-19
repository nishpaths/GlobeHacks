"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { MovementTelemetry, RecommendedPad } from "@globe/contracts";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useSensorPipeline } from "@/hooks/useSensorPipeline";

function drawRecoveryZoneMarkers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pads: RecommendedPad[],
) {
  ctx.clearRect(0, 0, width, height);
  const baseRadius = Math.max(8, Math.min(width, height) * 0.055);

  for (const pad of pads) {
    const pixelX = pad.position.x * width;
    const pixelY = pad.position.y * height;

    ctx.beginPath();
    ctx.arc(pixelX, pixelY, baseRadius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(220, 38, 38, 0.32)";
    ctx.fill();
    ctx.strokeStyle = "rgba(185, 28, 28, 0.95)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = `${Math.max(10, Math.round(baseRadius * 0.45))}px var(--font-sans, system-ui)`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pad.padType === "Sun" ? "☀" : "☽", pixelX, pixelY);
  }
}

// Derive RecommendedPad[] from the hook's lastAsymmetry (mirrors hook's internal logic,
// but typed against the @globe/contracts shape used by the canvas renderer)
function deriveLivePads(
  lastAsymmetry: import("@/types/pipeline").AsymmetryResult | null,
): RecommendedPad[] {
  if (!lastAsymmetry || !lastAsymmetry.thresholdExceeded) return [];
  const weakerSide = lastAsymmetry.left < lastAsymmetry.right ? "left" : "right";
  const strongerSide = weakerSide === "left" ? "right" : "left";
  return [
    {
      padType: "Sun",
      targetMuscle: `${weakerSide}_quadriceps`,
      position: { x: weakerSide === "left" ? 0.3 : 0.7, y: 0.6 },
    },
    {
      padType: "Moon",
      targetMuscle: `${strongerSide}_hamstrings`,
      position: { x: weakerSide === "left" ? 0.7 : 0.3, y: 0.35 },
    },
  ];
}

export interface CaptureOverlayProps {
  movement: MovementTelemetry;
  className?: string;
}

export function CaptureOverlay({ movement, className }: CaptureOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // ── Step 1: Wire up the live sensor pipeline ──────────────────────────────
  const { state, onStreamReady, onStreamError, onStreamInterrupted } = useSensorPipeline();
  const { showRepositioningGuidance, lastAsymmetry } = state;

  // Live pads from the pipeline; fall back to static prop when pipeline hasn't
  // produced data yet (e.g. before first asymmetry is detected)
  const livePads = deriveLivePads(lastAsymmetry);
  const activePads: RecommendedPad[] =
    livePads.length > 0 ? livePads : movement.recommendedPads;

  const redraw = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio ?? 1 : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // ── Use live pads instead of static movement.recommendedPads ─────────────
    drawRecoveryZoneMarkers(ctx, width, height, activePads);
  }, [activePads]);

  useEffect(() => {
    const video = videoRef.current;
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
          // ── Notify the pipeline that the stream is ready ──────────────────
          await onStreamReady(video);
        }
        setCameraError(null);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onStreamError(error);
        setCameraError(
          "Camera unavailable. Allow access in the browser, or use HTTPS / localhost.",
        );
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (video) {
        video.srcObject = null;
        onStreamInterrupted();
      }
    };
  }, [onStreamReady, onStreamError, onStreamInterrupted]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      redraw();
    });
    ro.observe(el);
    redraw();

    return () => ro.disconnect();
  }, [redraw]);

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-foreground/10"
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
          autoPlay
          aria-label="Live camera preview"
        />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        />

        {/* ── Step 2: Repositioning guidance banner ──────────────────────── */}
        {showRepositioningGuidance && (
          <div
            role="alert"
            aria-live="assertive"
            className="absolute inset-x-0 top-0 flex items-center justify-center bg-yellow-500/90 px-4 py-2 text-center text-sm font-semibold text-black"
          >
            Please turn sideways to face the camera
          </div>
        )}
      </div>

      {cameraError ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-4 text-sm text-destructive">{cameraError}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}
