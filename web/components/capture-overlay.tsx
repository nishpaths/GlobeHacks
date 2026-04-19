"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { MovementTelemetry, RecommendedPad } from "@globe/contracts";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

export interface CaptureOverlayProps {
  movement: MovementTelemetry;
  className?: string;
}

export function CaptureOverlay({ movement, className }: CaptureOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

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
    drawRecoveryZoneMarkers(ctx, width, height, movement.recommendedPads);
  }, [movement.recommendedPads]);

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
        }
        setCameraError(null);
      } catch {
        setCameraError(
          "Camera unavailable. Allow access in the browser, or use HTTPS / localhost.",
        );
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, []);

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
      </div>

      {cameraError ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-4 text-sm text-destructive">{cameraError}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}
