"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MovementTelemetry, RecommendedPad } from "@globe/contracts";

import { BodyZoneMap } from "@/components/zone-map/body-zone-map";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSensorPipeline } from "@/hooks/useSensorPipeline";
import { cn } from "@/lib/utils";
import type { AngleResult, Landmark } from "@/types/pipeline";

const POSE_CONNECTIONS: Array<[number, number]> = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];

const LANDMARK_VISIBILITY_THRESHOLD = 0.35;

export interface CaptureOverlayProps {
  movement?: MovementTelemetry;
  className?: string;
}

function drawPoseOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  landmarks: Landmark[] | null,
) {
  if (!landmarks || landmarks.length === 0) {
    return;
  }

  ctx.save();
  ctx.lineWidth = Math.max(2, Math.min(width, height) * 0.004);
  ctx.strokeStyle = "rgba(34, 197, 94, 0.82)";

  for (const [startIndex, endIndex] of POSE_CONNECTIONS) {
    const start = landmarks[startIndex];
    const end = landmarks[endIndex];

    if (
      !start ||
      !end ||
      start.visibility < LANDMARK_VISIBILITY_THRESHOLD ||
      end.visibility < LANDMARK_VISIBILITY_THRESHOLD
    ) {
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(start.x * width, start.y * height);
    ctx.lineTo(end.x * width, end.y * height);
    ctx.stroke();
  }

  for (const landmark of landmarks) {
    if (landmark.visibility < LANDMARK_VISIBILITY_THRESHOLD) {
      continue;
    }

    ctx.beginPath();
    ctx.arc(
      landmark.x * width,
      landmark.y * height,
      Math.max(3, Math.min(width, height) * 0.007),
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "rgba(163, 230, 53, 0.95)";
    ctx.fill();
  }

  ctx.restore();
}

function formatMuscleLabel(muscle: string): string {
  return muscle
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getPrimaryAngle(
  angles: Record<string, AngleResult> | null,
  jointName: string,
): number | null {
  const joint = angles?.[jointName];
  if (!joint) {
    return null;
  }

  return joint.angle3D ?? joint.angle2D ?? null;
}

function getSideLabel(side: "left" | "right"): string {
  return side === "left" ? "Left" : "Right";
}

function getPadPurpose(pad: RecommendedPad): string {
  return pad.padType === "Sun" ? "Activation" : "Support";
}

function buildSummaryText(
  analysis: {
    weakerSide: "left" | "right";
    delta: number;
    severity: "none" | "moderate" | "severe";
  } | null,
): string {
  if (!analysis) {
    return "Capture a short movement window to generate a stable recovery summary.";
  }

  const strongerSide = analysis.weakerSide === "left" ? "right" : "left";
  return `${getSideLabel(analysis.weakerSide)} side shows reduced movement depth compared with the ${strongerSide} side. The difference measured ${analysis.delta.toFixed(1)} degrees, which places this capture in the ${analysis.severity} range.`;
}

function buildActionText(pads: RecommendedPad[]): string {
  const sunPad = pads.find((pad) => pad.padType === "Sun");
  if (!sunPad) {
    return "No activation target was produced for this capture.";
  }

  return `Apply Sun pad to ${formatMuscleLabel(sunPad.targetMuscle)} for activation on the weaker side.`;
}

function buildSupportText(pads: RecommendedPad[]): string {
  const moonPad = pads.find((pad) => pad.padType === "Moon");
  if (!moonPad) {
    return "No opposite-side support target was produced for this capture.";
  }

  return `Apply Moon pad to ${formatMuscleLabel(moonPad.targetMuscle)} to support symmetry on the opposite side.`;
}

export function CaptureOverlay({ movement, className }: CaptureOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const { state, startCapture, resetSession, onStreamReady, onStreamError, onStreamInterrupted } =
    useSensorPipeline();

  const {
    phase,
    showRepositioningGuidance,
    poseDetected,
    lastLandmarks,
    currentAngles,
    isStreaming,
    isInitialising,
    framesProcessed,
    calibrationProgress,
    captureProgress,
    captureDurationMs,
    telemetryStatus,
    lastExplanation,
    lastRecommendedPads,
    lastProtocolSuggestion,
    lastBackendAnalysis,
    error,
  } = state;

  const leftKneeAngle = getPrimaryAngle(currentAngles, "left_knee");
  const rightKneeAngle = getPrimaryAngle(currentAngles, "right_knee");

  const resultPads = useMemo<RecommendedPad[]>(
    () =>
      lastRecommendedPads.length > 0
        ? lastRecommendedPads
        : ((movement?.recommendedPads as RecommendedPad[] | undefined) ?? []),
    [lastRecommendedPads, movement?.recommendedPads],
  );

  const canStartCapture = isStreaming && !isInitialising && phase !== "capturing" && phase !== "analyzing";
  const captureSeconds = Math.ceil((captureDurationMs * (1 - captureProgress)) / 1000);
  const shouldDrawPose = phase === "idle" || phase === "capturing";

  // Countdown timer — decrements every second; fires startCapture when it hits 0
  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      const id = setTimeout(() => setCountdown((c) => (c !== null ? c - 1 : null)), 1000);
      return () => clearTimeout(id);
    }
    // countdown === 0
    startCapture();
    setCountdown(null);
  }, [countdown, startCapture]);

  const redraw = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) {
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio ?? 1 : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (shouldDrawPose) {
      drawPoseOverlay(ctx, width, height, lastLandmarks);
    }
  }, [lastLandmarks, shouldDrawPose]);

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
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
          await onStreamReady(video);
        }

        setCameraError(null);
      } catch (err) {
        const nextError = err instanceof Error ? err : new Error(String(err));
        onStreamError(nextError);
        setCameraError(
          "Camera unavailable. Allow access in the browser, or use HTTPS / localhost.",
        );
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (video) {
        video.srcObject = null;
        onStreamInterrupted();
      }
    };
  }, [onStreamError, onStreamInterrupted, onStreamReady]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(() => {
      redraw();
    });

    observer.observe(element);
    redraw();

    return () => observer.disconnect();
  }, [redraw]);

  const phaseHeadline =
    phase === "idle"
      ? "Ready for a controlled capture"
      : phase === "capturing"
        ? "Capturing movement"
        : phase === "analyzing"
          ? "Analyzing movement"
          : "Results locked";

  const phaseBody =
    phase === "idle"
      ? "Start an 8-second protocol window when the athlete is framed from the side. The system will capture first, then analyze after the motion ends."
      : phase === "capturing"
        ? "Keep a clean side profile and perform slow controlled squats. The interface will stay quiet until the capture window ends."
        : phase === "analyzing"
          ? "The movement window is frozen. Generating the recovery summary, pad guidance, and protocol now."
          : "This analysis is frozen. Nothing on this screen will keep shifting while you review the recommendation.";

  return (
    <div className={cn("flex w-full flex-col gap-6", className)}>
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="overflow-hidden border-white/10 bg-slate-950/80 shadow-[0_30px_80px_rgba(2,6,23,0.45)]">
          <div
            ref={containerRef}
            className="relative aspect-[16/10] w-full overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_35%),linear-gradient(180deg,rgba(2,6,23,0.2),rgba(2,6,23,0.7))]"
          >
            <video
              ref={videoRef}
              className={cn(
                "absolute inset-0 h-full w-full object-cover transition-all duration-500",
                phase === "results" ? "scale-[1.02] blur-sm brightness-[0.28]" : "brightness-[0.72]",
              )}
              playsInline
              muted
              autoPlay
              aria-label="Live camera preview"
            />
            <canvas
              ref={canvasRef}
              className={cn(
                "pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-300",
                shouldDrawPose ? "opacity-100" : "opacity-0",
              )}
              aria-hidden
            />

            {/* Countdown overlay */}
            {countdown !== null && countdown > 0 ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="text-9xl font-bold text-white drop-shadow-[0_0_40px_rgba(59,130,246,0.9)]">
                  {countdown}
                </span>
              </div>
            ) : null}

            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.12),rgba(2,6,23,0.45))]" />

            {showRepositioningGuidance && (phase === "idle" || phase === "capturing") ? (
              <div className="absolute inset-x-0 top-0 flex items-center justify-center bg-amber-400/90 px-4 py-2 text-center text-sm font-semibold text-slate-950">
                Please turn sideways so both knees stay readable through the full squat.
              </div>
            ) : null}

            <div className="absolute left-5 top-5 flex flex-wrap items-center gap-2">
              <Badge className="bg-emerald-400/15 text-emerald-100 ring-1 ring-emerald-300/20">
                {isStreaming ? "Camera Ready" : "Preparing Camera"}
              </Badge>
              <Badge className="bg-white/8 text-white/80 ring-1 ring-white/10">
                {poseDetected ? "Pose Locked" : "Finding Pose"}
              </Badge>
              {phase === "capturing" ? (
                <Badge className="bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-300/20">
                  Live Capture
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="border-t border-white/10 bg-slate-950/90 p-5 md:p-6">
            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/72 p-5 backdrop-blur-xl">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.32em] text-white/45">
                    {phaseHeadline}
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight text-white">
                    {phase === "results" && lastBackendAnalysis
                      ? `${getSideLabel(lastBackendAnalysis.weakerSide)} side needs more support`
                      : phase === "analyzing"
                        ? "Hold while the decision layer finishes"
                        : "Capture first. Show insight second."}
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-white/70">{phaseBody}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {phase === "results" ? (
                    <Button
                      className="h-11 rounded-full bg-[linear-gradient(135deg,#2563eb,#7c3aed)] px-5 text-white shadow-[0_12px_40px_rgba(59,130,246,0.35)] hover:scale-[1.01]"
                      disabled={countdown !== null}
                      onClick={() => setCountdown(3)}
                    >
                      {countdown !== null ? `Starting in ${countdown}...` : "Capture Again"}
                    </Button>
                  ) : (
                    <Button
                      className="h-11 rounded-full bg-[linear-gradient(135deg,#2563eb,#7c3aed)] px-5 text-white shadow-[0_12px_40px_rgba(59,130,246,0.35)] hover:scale-[1.01]"
                      disabled={!canStartCapture || countdown !== null}
                      onClick={() => setCountdown(3)}
                    >
                      {countdown !== null
                        ? `Starting in ${countdown}...`
                        : isInitialising
                          ? "Preparing Camera..."
                          : isStreaming
                            ? "Start Protocol"
                            : "Waiting for Camera"}
                    </Button>
                  )}
                  {phase === "results" ? (
                    <Button
                      variant="outline"
                      className="h-11 rounded-full border-white/15 bg-white/5 px-5 text-white hover:bg-white/10"
                      onClick={resetSession}
                    >
                      Clear Results
                    </Button>
                  ) : null}
                </div>
              </div>

              {phase === "capturing" ? (
                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.28em] text-white/45">
                    <span>Capture Progress</span>
                    <span>{captureSeconds}s remaining</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#22c55e,#38bdf8)] transition-[width] duration-100"
                      style={{ width: `${Math.round(captureProgress * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {phase === "analyzing" ? (
                <div className="mt-5 flex items-center gap-3 text-sm text-white/75">
                  <span className="inline-flex h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.8)] animate-pulse" />
                  Analyzing movement and freezing the recommendation set…
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        {phase === "results" ? (
          <div className="grid gap-6">
            <Card className="border-white/10 bg-slate-950/80">
              <CardHeader>
                <CardTitle className="text-white">Decision Summary</CardTitle>
                <CardDescription>
                  Frozen output from the completed capture window.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-white/45">Summary</p>
                  <p className="mt-2 text-sm leading-6 text-white/80">
                    {buildSummaryText(lastBackendAnalysis)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-white/45">Action</p>
                  <p className="mt-2 text-sm leading-6 text-white/80">
                    {buildActionText(resultPads)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-white/45">Support</p>
                  <p className="mt-2 text-sm leading-6 text-white/80">
                    {buildSupportText(resultPads)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-white/45">AI Explanation</p>
                  <p className="mt-2 text-sm leading-6 text-white/80">
                    {lastExplanation ?? "The explanation layer will appear here after a successful analysis."}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-slate-950/80">
              <CardHeader>
                <CardTitle className="text-white">Protocol</CardTitle>
                <CardDescription>Backend-generated recovery settings for this capture.</CardDescription>
              </CardHeader>
              <CardContent>
                {lastProtocolSuggestion ? (
                  <div className="grid gap-4 sm:grid-cols-3 sm:items-start">
                    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.28em] text-white/45">Thermal Cycle</p>
                      <p className="mt-3 text-2xl font-semibold tabular-nums text-white">
                        {lastProtocolSuggestion.thermalCycleSeconds}s
                      </p>
                    </div>
                    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="truncate text-xs uppercase tracking-[0.28em] text-white/45">Photobiomod.</p>
                      <div className="mt-3 space-y-0.5 text-2xl font-semibold tabular-nums leading-snug text-white">
                        <p>{lastProtocolSuggestion.photobiomodulation.red} nm</p>
                        <p>{lastProtocolSuggestion.photobiomodulation.blue} nm</p>
                      </div>
                    </div>
                    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.28em] text-white/45">Mechanical Frequency</p>
                      <p className="mt-3 text-2xl font-semibold tabular-nums text-white">
                        {lastProtocolSuggestion.mechanicalFrequencyHz} Hz
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-white/65">
                    Protocol values will appear here after analysis completes.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="border-white/10 bg-slate-950/80">
            <CardHeader>
              <CardTitle className="text-white">
                {phase === "capturing"
                  ? "Capture Window"
                  : phase === "analyzing"
                    ? "Analyzing"
                    : "Before You Start"}
              </CardTitle>
              <CardDescription>
                {phase === "capturing"
                  ? "The system is intentionally quiet during capture so the user can focus on the movement."
                  : phase === "analyzing"
                    ? "The capture is frozen. Stable insights appear only after this short analysis phase."
                    : "Frame the athlete first, then trigger a short capture window."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {phase === "idle" ? (
                <>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.28em] text-white/45">Readiness</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Camera</p>
                        <p className="mt-1 text-sm text-white/80">
                          {isStreaming ? "Live preview available" : "Waiting for stream"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Pose</p>
                        <p className="mt-1 text-sm text-white/80">
                          {poseDetected ? "Body detected in frame" : "Stand in frame"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">View</p>
                        <p className="mt-1 text-sm text-white/80">
                          {showRepositioningGuidance
                            ? "Rotate into a cleaner side profile"
                            : "Side profile preferred"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.28em] text-white/45">Flow</p>
                    <p className="mt-3 text-sm leading-6 text-white/75">
                      Start Protocol begins an 8-second capture. During that window, the camera
                      tracks the movement and collects a clean snapshot. Once capture ends, the
                      numbers stop and the decision layer produces a frozen result screen.
                    </p>
                  </div>
                </>
              ) : null}

              {phase === "capturing" ? (
                <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/8 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.28em] text-cyan-100/70">
                        Live Capture
                      </p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        Perform 2–3 slow side-view squats.
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.28em] text-white/45">Progress</p>
                      <p className="mt-2 text-3xl font-semibold text-white">
                        {Math.round(captureProgress * 100)}%
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#22c55e,#38bdf8)] transition-[width] duration-100"
                      style={{ width: `${Math.round(captureProgress * 100)}%` }}
                    />
                  </div>
                  <p className="mt-4 text-sm leading-6 text-white/72">
                    No metrics are shown during capture. Keep both knees visible and finish the
                    movement window without stopping mid-rep.
                  </p>
                </div>
              ) : null}

              {phase === "analyzing" ? (
                <div className="rounded-2xl border border-violet-300/15 bg-violet-400/8 p-5">
                  <p className="text-xs uppercase tracking-[0.28em] text-violet-100/70">
                    Analysis Phase
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    Turning the captured motion into a stable recommendation set.
                  </p>
                  <p className="mt-3 text-sm leading-6 text-white/72">
                    The capture window is closed. The backend is processing imbalance, pad
                    placement, protocol values, and the explanation layer.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}
      </div>

      {phase === "results" ? (
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-white/10 bg-slate-950/80">
            <CardHeader>
              <CardTitle className="text-white">Pad Instructions</CardTitle>
              <CardDescription>
                Text-first guidance with zone highlights instead of live hotspots.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {resultPads.length > 0 ? (
                resultPads.map((pad) => (
                  <div
                    key={`${pad.padType}-${pad.targetMuscle}`}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                          {pad.padType} Pad
                        </p>
                        <p className="mt-2 text-lg font-semibold text-white">
                          Apply to {formatMuscleLabel(pad.targetMuscle)}
                        </p>
                      </div>
                      <Badge
                        className={cn(
                          "rounded-full px-3 py-1",
                          pad.padType === "Sun"
                            ? "bg-orange-400/16 text-orange-100 ring-1 ring-orange-300/20"
                            : "bg-sky-400/16 text-sky-100 ring-1 ring-sky-300/20",
                        )}
                      >
                        {getPadPurpose(pad)}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-white/72">
                      {pad.padType === "Sun"
                        ? "This zone receives activation on the side showing less movement depth."
                        : "This zone receives opposite-side support to help maintain symmetry."}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-white/65">
                  No pad instructions are available for this capture.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/80">
            <CardHeader>
              <CardTitle className="text-white">Zone Map</CardTitle>
              <CardDescription>
                Whole-region highlighting driven by backend output only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BodyZoneMap pads={resultPads} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {phase !== "results" ? (
        <Card className="border-white/10 bg-slate-950/80">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">Pipeline Status</p>
              <p className="text-sm text-white/75">
                {phase === "capturing"
                  ? "Capture is active. Metrics are hidden on purpose until analysis is complete."
                  : phase === "analyzing"
                    ? "Backend analysis is running against the frozen capture snapshot."
                    : error || cameraError || "Camera is live. Start Protocol when the athlete is ready."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.24em] text-white/45">
              <span>Frames {framesProcessed}</span>
              <span>Calibration {Math.round(calibrationProgress * 100)}%</span>
              <span>{telemetryStatus}</span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {cameraError ? (
        <Card className="border-rose-400/30 bg-rose-950/40">
          <CardContent className="py-5 text-sm text-rose-100">{cameraError}</CardContent>
        </Card>
      ) : null}

      {phase === "idle" && (leftKneeAngle !== null || rightKneeAngle !== null) ? (
        <Card className="border-white/10 bg-slate-950/80">
          <CardContent className="py-5 text-sm text-white/65">
            Live joint values are intentionally hidden during the workflow. The capture window
            collects the movement first, then the decision screen reveals the stable result.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
