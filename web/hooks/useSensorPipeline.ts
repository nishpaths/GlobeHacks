"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";

import { PipelineConfig } from "@/config/pipelineConfig";
import { useAlignmentWarningRate } from "@/hooks/useAlignmentWarningRate";
import { buildPadTargets, getMovementProfile, getMovementSeverity } from "@/lib/movement-profiles";
import PipelineEventBus from "@/lib/pipelineEventBus";
import { computeAngleFrame } from "@/modules/angleCalculator";
import { validateAlignment } from "@/modules/alignmentValidator";
import { OutlierDetector } from "@/modules/outlierDetector";
import { PoseEngine } from "@/modules/poseEngine";
import { buildPayload, transmitWithRetry } from "@/modules/telemetrySerialiser";
import type { RecommendedPad } from "@globe/contracts";
import type {
  AngleResult,
  AsymmetryResult,
  Landmark,
  PadRecord,
  PipelineDebugEvent,
  PipelineEventType,
  ProtocolRecord,
  RepetitionResult,
} from "@/types/pipeline";

type SessionPhase = "idle" | "capturing" | "analyzing" | "results";

interface BackendAnalysisRecord {
  imbalanceDetected: boolean;
  delta: number;
  weakerSide: "left" | "right";
  targetMuscle: string;
  severity: "none" | "moderate" | "severe";
}

interface CaptureAccumulator {
  sessionId: string;
  reps: RepetitionResult[];
  bestAsymmetry: AsymmetryResult | null;
  recommendedPads: PadRecord[];
}

export interface PipelineState {
  phase: SessionPhase;
  isInitialising: boolean;
  isStreaming: boolean;
  poseEngineError: boolean;
  error: string | null;
  lastAsymmetry: AsymmetryResult | null;
  showRepositioningGuidance: boolean;
  poseDetected: boolean;
  lastLandmarks: Landmark[] | null;
  currentAngles: Record<string, AngleResult> | null;
  framesProcessed: number;
  repsDetected: number;
  calibrationProgress: number;
  captureProgress: number;
  captureDurationMs: number;
  telemetryStatus: "idle" | "sending" | "sent" | "failed";
  lastTelemetryMessage: string | null;
  lastTelemetrySaved: boolean | null;
  lastTelemetryAt: string | null;
  lastExplanation: string | null;
  lastRecommendedPads: RecommendedPad[];
  lastProtocolSuggestion: ProtocolRecord | null;
  lastBackendAnalysis: BackendAnalysisRecord | null;
  recentEvents: PipelineDebugEvent[];
  sessionId: string;
}

const CAPTURE_DURATION_MS = 8000;
const ANALYSIS_DELAY_MS = 800;

const DEFAULT_PROTOCOL: ProtocolRecord = {
  thermalCycleSeconds: 90,
  photobiomodulation: { red: 660, blue: 470 },
  mechanicalFrequencyHz: 32,
};

function deriveRecommendedPads(asymmetry: AsymmetryResult | null): PadRecord[] {
  if (!asymmetry || !asymmetry.thresholdExceeded) {
    return [];
  }

  const weakerSide = asymmetry.left <= asymmetry.right ? "left" : "right";
  return buildPadTargets(asymmetry.joint, weakerSide).recommendedPads;
}

function buildLocalAnalysis(asymmetry: AsymmetryResult): BackendAnalysisRecord {
  const weakerSide = asymmetry.left <= asymmetry.right ? "left" : "right";
  const profile = getMovementProfile(asymmetry.joint);
  const severity = getMovementSeverity(asymmetry.delta);

  return {
    imbalanceDetected: asymmetry.delta > PipelineConfig.ASYMMETRY_THRESHOLD_DEG,
    delta: asymmetry.delta,
    weakerSide,
    targetMuscle: profile.primaryMuscle,
    severity,
  };
}

function buildFallbackExplanation(analysis: BackendAnalysisRecord): string {
  const oppositeSide = analysis.weakerSide === "left" ? "right" : "left";
  return `${analysis.weakerSide === "left" ? "Left" : "Right"} side shows less movement depth, so activation is focused there to improve balance. ${oppositeSide === "left" ? "Left" : "Right"} side receives support to help maintain symmetry through the motion.`;
}

function selectBestAsymmetry(
  current: AsymmetryResult | null,
  candidates: AsymmetryResult[],
): AsymmetryResult | null {
  if (candidates.length === 0) {
    return current;
  }

  const bestCandidate = candidates.reduce((best, candidate) =>
    candidate.delta > best.delta ? candidate : best,
  );

  if (!current) {
    return bestCandidate;
  }

  return bestCandidate.delta > current.delta ? bestCandidate : current;
}

function formatPipelineEventMessage(
  type: PipelineEventType,
  payload?: unknown,
): string {
  const details = payload && typeof payload === "object" ? payload : null;

  switch (type) {
    case "low-confidence-landmark": {
      const index =
        typeof (details as { index?: unknown } | null)?.index === "number"
          ? (details as { index: number }).index
          : null;
      return index === null
        ? "Low-confidence landmark detected."
        : `Landmark ${index} confidence is low.`;
    }
    case "alignment-warning": {
      const joint =
        typeof (details as { joint?: unknown } | null)?.joint === "string"
          ? (details as { joint: string }).joint.replaceAll("_", " ")
          : "joint";
      return `Alignment warning on ${joint}. Try holding a clearer side profile.`;
    }
    case "repositioning-guidance":
      return "The pose tracker wants a cleaner side view before analysis continues.";
    case "repetition-discarded":
      return typeof (details as { reason?: unknown } | null)?.reason === "string"
        ? (details as { reason: string }).reason
        : "A repetition was discarded because there were not enough valid frames.";
    case "serialisation-error":
      return typeof (details as { message?: unknown } | null)?.message === "string"
        ? (details as { message: string }).message
        : "Telemetry could not be prepared for sending.";
    case "transmission-failure":
      return typeof (details as { message?: unknown } | null)?.message === "string"
        ? (details as { message: string }).message
        : "Telemetry failed to reach the backend.";
    case "pose-engine-init-failure":
      return "The motion tracking engine did not finish loading.";
    case "camera-permission-denied":
      return "Camera permission was denied.";
    case "stream-interrupted":
      return "Camera stream was interrupted.";
    default:
      return `${String(type).replace(/-/g, " ")}.`;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

interface TelemetryApiResponse {
  success?: boolean;
  analysis?: BackendAnalysisRecord;
  recommendedPads?: RecommendedPad[];
  protocolSuggestion?: ProtocolRecord;
  explanation?: string;
}

const INITIAL_STATE: PipelineState = {
  phase: "idle",
  isInitialising: false,
  isStreaming: false,
  poseEngineError: false,
  error: null,
  lastAsymmetry: null,
  showRepositioningGuidance: false,
  poseDetected: false,
  lastLandmarks: null,
  currentAngles: null,
  framesProcessed: 0,
  repsDetected: 0,
  calibrationProgress: 0,
  captureProgress: 0,
  captureDurationMs: CAPTURE_DURATION_MS,
  telemetryStatus: "idle",
  lastTelemetryMessage: null,
  lastTelemetrySaved: null,
  lastTelemetryAt: null,
  lastExplanation: null,
  lastRecommendedPads: [],
  lastProtocolSuggestion: null,
  lastBackendAnalysis: null,
  recentEvents: [],
  sessionId: uuidv4(),
};

export function useSensorPipeline() {
  const [state, setState] = useState<PipelineState>(INITIAL_STATE);

  const poseEngineRef = useRef<PoseEngine | null>(null);
  const outlierDetectorRef = useRef<OutlierDetector>(new OutlierDetector());
  const captureAccumulatorRef = useRef<CaptureAccumulator | null>(null);
  const sessionIdRef = useRef<string>(INITIAL_STATE.sessionId);
  const phaseRef = useRef<SessionPhase>(INITIAL_STATE.phase);
  const captureStartedAtRef = useRef<number | null>(null);
  const captureTimeoutRef = useRef<number | null>(null);
  const captureProgressIntervalRef = useRef<number | null>(null);

  const {
    showRepositioningGuidance,
    recordNoWarning,
    reset: resetWarningRate,
  } = useAlignmentWarningRate();

  const clearCaptureTimers = useCallback(() => {
    if (captureTimeoutRef.current !== null) {
      window.clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }

    if (captureProgressIntervalRef.current !== null) {
      window.clearInterval(captureProgressIntervalRef.current);
      captureProgressIntervalRef.current = null;
    }
  }, []);

  const syncPhase = useCallback((phase: SessionPhase) => {
    phaseRef.current = phase;
    setState((prev) => ({ ...prev, phase }));
  }, []);

  const finalizeCapture = useCallback(async () => {
    if (phaseRef.current !== "capturing") {
      return;
    }

    clearCaptureTimers();
    phaseRef.current = "analyzing";

    setState((prev) => ({
      ...prev,
      phase: "analyzing",
      captureProgress: 1,
      telemetryStatus: "sending",
      lastTelemetrySaved: null,
      lastTelemetryAt: null,
      lastTelemetryMessage: "Analyzing movement…",
    }));

    await delay(ANALYSIS_DELAY_MS);

    const capture = captureAccumulatorRef.current;

    if (!capture || capture.reps.length === 0 || !capture.bestAsymmetry) {
      setState((prev) => ({
        ...prev,
        phase: "results",
        telemetryStatus: "failed",
        lastTelemetrySaved: false,
        lastTelemetryAt: new Date().toISOString(),
        lastTelemetryMessage:
          "Capture complete, but the system could not form a stable left-right comparison. Try another capture with both knees visible through the full movement.",
        lastExplanation: null,
        lastRecommendedPads: [],
        lastProtocolSuggestion: null,
        lastBackendAnalysis: null,
      }));
      phaseRef.current = "results";
      return;
    }

    const fallbackAnalysis = buildLocalAnalysis(capture.bestAsymmetry);
    const fallbackPads = capture.recommendedPads;
    const fallbackExplanation = buildFallbackExplanation(fallbackAnalysis);

    try {
      const payload = buildPayload(
        capture.sessionId,
        capture.reps,
        capture.bestAsymmetry,
        capture.recommendedPads,
        DEFAULT_PROTOCOL,
      );

      const response = await transmitWithRetry(payload);
      const parsed = (await response.json().catch(() => null)) as TelemetryApiResponse | null;

      setState((prev) => ({
        ...prev,
        phase: "results",
        telemetryStatus: "sent",
        lastTelemetrySaved: true,
        lastTelemetryAt: new Date().toISOString(),
        lastTelemetryMessage:
          "Analysis complete. Review the summary, protocol, and pad placement guidance below.",
        lastExplanation:
          typeof parsed?.explanation === "string" && parsed.explanation.trim() !== ""
            ? parsed.explanation
            : fallbackExplanation,
        lastRecommendedPads:
          Array.isArray(parsed?.recommendedPads) && parsed.recommendedPads.length > 0
            ? parsed.recommendedPads
            : fallbackPads,
        lastProtocolSuggestion:
          parsed?.protocolSuggestion ?? prev.lastProtocolSuggestion ?? DEFAULT_PROTOCOL,
        lastBackendAnalysis: parsed?.analysis ?? fallbackAnalysis,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        phase: "results",
        telemetryStatus: "failed",
        lastTelemetrySaved: false,
        lastTelemetryAt: new Date().toISOString(),
        lastTelemetryMessage:
          error instanceof Error
            ? error.message
            : "Analysis failed before the backend returned a response.",
        lastExplanation: fallbackExplanation,
        lastRecommendedPads: fallbackPads,
        lastProtocolSuggestion: prev.lastProtocolSuggestion ?? DEFAULT_PROTOCOL,
        lastBackendAnalysis: fallbackAnalysis,
      }));
    }

    phaseRef.current = "results";
  }, [clearCaptureTimers]);

  const startCapture = useCallback(() => {
    if (!state.isStreaming || state.isInitialising) {
      return;
    }

    clearCaptureTimers();
    outlierDetectorRef.current.reset();
    resetWarningRate();

    const nextSessionId = uuidv4();
    sessionIdRef.current = nextSessionId;
    captureStartedAtRef.current = performance.now();
    captureAccumulatorRef.current = {
      sessionId: nextSessionId,
      reps: [],
      bestAsymmetry: null,
      recommendedPads: [],
    };
    phaseRef.current = "capturing";

    setState((prev) => ({
      ...prev,
      phase: "capturing",
      error: null,
      lastAsymmetry: null,
      framesProcessed: 0,
      repsDetected: 0,
      calibrationProgress: 0,
      captureProgress: 0,
      telemetryStatus: "idle",
      lastTelemetryMessage: null,
      lastTelemetrySaved: null,
      lastTelemetryAt: null,
      lastExplanation: null,
      lastRecommendedPads: [],
      lastProtocolSuggestion: null,
      lastBackendAnalysis: null,
      recentEvents: [],
      sessionId: nextSessionId,
    }));

    captureProgressIntervalRef.current = window.setInterval(() => {
      const startedAt = captureStartedAtRef.current;
      if (startedAt === null) {
        return;
      }

      const progress = Math.min((performance.now() - startedAt) / CAPTURE_DURATION_MS, 1);
      setState((prev) => ({ ...prev, captureProgress: progress }));
    }, 100);

    captureTimeoutRef.current = window.setTimeout(() => {
      void finalizeCapture();
    }, CAPTURE_DURATION_MS);
  }, [clearCaptureTimers, finalizeCapture, resetWarningRate, state.isInitialising, state.isStreaming]);

  const resetSession = useCallback(() => {
    clearCaptureTimers();
    phaseRef.current = "idle";
    captureStartedAtRef.current = null;
    captureAccumulatorRef.current = null;
    outlierDetectorRef.current.reset();
    resetWarningRate();
    const nextSessionId = uuidv4();

    setState((prev) => ({
      ...prev,
      phase: "idle",
      error: null,
      lastAsymmetry: null,
      framesProcessed: 0,
      repsDetected: 0,
      calibrationProgress: 0,
      captureProgress: 0,
      telemetryStatus: "idle",
      lastTelemetryMessage: null,
      lastTelemetrySaved: null,
      lastTelemetryAt: null,
      lastExplanation: null,
      lastRecommendedPads: [],
      lastProtocolSuggestion: null,
      lastBackendAnalysis: null,
      recentEvents: [],
      sessionId: nextSessionId,
    }));
  }, [clearCaptureTimers, resetWarningRate]);

  const onStreamReady = useCallback(async (videoEl: HTMLVideoElement) => {
    setState((prev) => ({ ...prev, isInitialising: true, error: null }));

    const engine = new PoseEngine();
    poseEngineRef.current = engine;

    try {
      await engine.init({
        onInitFailure: () => {
          setState((prev) => ({
            ...prev,
            isInitialising: false,
            poseEngineError: true,
            error: "Motion tracking engine failed to load",
          }));
        },
        onLandmarks: (landmarkSet) => {
          const angleFrame = computeAngleFrame(
            landmarkSet,
            PipelineConfig.JOINTS,
            PipelineConfig.POSE_CONFIDENCE_THRESHOLD,
          );
          const validatedFrame = validateAlignment(
            angleFrame,
            PipelineConfig.ALIGNMENT_THRESHOLD_DEG,
          );

          setState((prev) => ({
            ...prev,
            poseDetected: true,
            lastLandmarks: landmarkSet.landmarks,
            currentAngles: validatedFrame.angles,
          }));

          for (const [jointName, hasWarning] of Object.entries(
            validatedFrame.alignmentWarnings,
          )) {
            if (!hasWarning) {
              recordNoWarning(jointName);
            }
          }

          if (phaseRef.current !== "capturing") {
            return;
          }

          const newReps = outlierDetectorRef.current.processFrame(validatedFrame);
          const detectorDebug = outlierDetectorRef.current.getDebugState();
          const capture = captureAccumulatorRef.current;

          if (!capture) {
            return;
          }

          if (newReps.length > 0) {
            capture.reps = [...capture.reps, ...newReps];
            capture.bestAsymmetry = selectBestAsymmetry(
              capture.bestAsymmetry,
              outlierDetectorRef.current.getAsymmetry(capture.reps),
            );
            capture.recommendedPads = deriveRecommendedPads(capture.bestAsymmetry);
          }

          setState((prev) => ({
            ...prev,
            framesProcessed: prev.framesProcessed + 1,
            repsDetected: capture.reps.length,
            calibrationProgress: detectorDebug.calibrationProgress,
            lastAsymmetry: capture.bestAsymmetry,
          }));
        },
      });

      engine.startLoop(videoEl);
      setState((prev) => ({
        ...prev,
        isInitialising: false,
        isStreaming: true,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        isInitialising: false,
        poseEngineError: true,
        error: "Failed to start motion tracking",
      }));
    }
  }, [recordNoWarning]);

  const onStreamError = useCallback((error: Error) => {
    clearCaptureTimers();
    phaseRef.current = "idle";
    setState((prev) => ({
      ...prev,
      phase: "idle",
      isStreaming: false,
      poseDetected: false,
      error: error.message,
      telemetryStatus: "failed",
      lastTelemetryMessage: error.message,
    }));
  }, [clearCaptureTimers]);

  const onStreamInterrupted = useCallback(() => {
    clearCaptureTimers();
    phaseRef.current = "idle";
    setState((prev) => ({
      ...prev,
      phase: "idle",
      isStreaming: false,
      poseDetected: false,
      lastLandmarks: null,
      currentAngles: null,
      captureProgress: 0,
    }));
  }, [clearCaptureTimers]);

  useEffect(() => {
    const eventTypes: PipelineEventType[] = [
      "camera-permission-denied",
      "stream-interrupted",
      "pose-engine-init-failure",
      "low-confidence-landmark",
      "alignment-warning",
      "repositioning-guidance",
      "repetition-discarded",
      "serialisation-error",
      "transmission-failure",
    ];

    const handlers = eventTypes.map((type) => {
      const handler = (payload?: unknown) => {
        setState((prev) => ({
          ...prev,
          recentEvents: [
            {
              type,
              message: formatPipelineEventMessage(type, payload),
              at: new Date().toISOString(),
            },
            ...prev.recentEvents,
          ].slice(0, 8),
        }));
      };

      PipelineEventBus.on(type, handler);
      return { type, handler };
    });

    return () => {
      for (const { type, handler } of handlers) {
        PipelineEventBus.off(type, handler);
      }
    };
  }, []);

  useEffect(() => {
    setState((prev) => ({
      ...prev,
      showRepositioningGuidance:
        showRepositioningGuidance && (prev.phase === "idle" || prev.phase === "capturing"),
    }));
  }, [showRepositioningGuidance]);

  useEffect(() => {
    const detector = outlierDetectorRef.current;
    return () => {
      clearCaptureTimers();
      poseEngineRef.current?.destroy();
      poseEngineRef.current = null;
      detector.reset();
      captureAccumulatorRef.current = null;
      resetWarningRate();
    };
  }, [clearCaptureTimers, resetWarningRate]);

  return {
    state,
    startCapture,
    resetSession,
    onStreamReady,
    onStreamError,
    onStreamInterrupted,
    setPhase: syncPhase,
  };
}
