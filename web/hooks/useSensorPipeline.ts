"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { PoseEngine } from "@/modules/poseEngine";
import { computeAngleFrame } from "@/modules/angleCalculator";
import { validateAlignment } from "@/modules/alignmentValidator";
import { OutlierDetector } from "@/modules/outlierDetector";
import { buildPayload, transmitWithRetry } from "@/modules/telemetrySerialiser";
import { useAlignmentWarningRate } from "@/hooks/useAlignmentWarningRate";
import PipelineEventBus from "@/lib/pipelineEventBus";
import { PipelineConfig } from "@/config/pipelineConfig";
import type { AsymmetryResult, PadRecord, ProtocolRecord } from "@/types/pipeline";

export interface PipelineState {
  isInitialising: boolean;
  isStreaming: boolean;
  poseEngineError: boolean;
  error: string | null;
  lastAsymmetry: AsymmetryResult | null;
  showRepositioningGuidance: boolean;
  sessionId: string;
}

/**
 * Default pad placement and protocol suggestion derived from asymmetry.
 * In production these would be computed by the intervention mapping module (Dev 2).
 */
function deriveRecommendedPads(asymmetry: AsymmetryResult | null): PadRecord[] {
  if (!asymmetry || !asymmetry.thresholdExceeded) return [];
  const weakerSide = asymmetry.left < asymmetry.right ? "left" : "right";
  return [
    {
      pad: "Sun",
      position: { x: weakerSide === "left" ? 0.3 : 0.7, y: 0.6 },
      muscle: `${weakerSide} quadriceps`,
    },
    {
      pad: "Moon",
      position: { x: weakerSide === "left" ? 0.7 : 0.3, y: 0.35 },
      muscle: `${weakerSide === "left" ? "right" : "left"} hamstrings`,
    },
  ];
}

const DEFAULT_PROTOCOL: ProtocolRecord = {
  thermalCycleSeconds: 9,
  photobiomodulation: { red: 660, blue: 450 },
  mechanicalFrequencyHz: 40,
};

/**
 * useSensorPipeline — orchestrates the full sensor & telemetry pipeline.
 *
 * Usage:
 *   const { state, onStreamReady, onStreamError, onStreamInterrupted } = useSensorPipeline();
 */
export function useSensorPipeline() {
  const sessionId = useRef<string>(uuidv4());
  const poseEngineRef = useRef<PoseEngine | null>(null);
  const outlierDetectorRef = useRef<OutlierDetector>(new OutlierDetector());
  const allRepsRef = useRef<import("@/types/pipeline").RepetitionResult[]>([]);

  const [state, setState] = useState<PipelineState>({
    isInitialising: false,
    isStreaming: false,
    poseEngineError: false,
    error: null,
    lastAsymmetry: null,
    showRepositioningGuidance: false,
    sessionId: sessionId.current,
  });

  const { showRepositioningGuidance, reset: resetWarningRate } =
    useAlignmentWarningRate();

  // Sync repositioning guidance into state
  useEffect(() => {
    setState((prev) => ({ ...prev, showRepositioningGuidance }));
  }, [showRepositioningGuidance]);

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
          // Stage 2: compute angles
          const angleFrame = computeAngleFrame(
            landmarkSet,
            PipelineConfig.JOINTS,
            PipelineConfig.POSE_CONFIDENCE_THRESHOLD
          );

          // Stage 2: validate alignment
          const validatedFrame = validateAlignment(
            angleFrame,
            PipelineConfig.ALIGNMENT_THRESHOLD_DEG
          );

          // Stage 3: detect repetitions and asymmetry
          const newReps = outlierDetectorRef.current.processFrame(validatedFrame);
          if (newReps.length > 0) {
            allRepsRef.current = [...allRepsRef.current, ...newReps];
            const asymmetryResults = outlierDetectorRef.current.getAsymmetry(
              allRepsRef.current
            );

            if (asymmetryResults.length > 0) {
              const latest = asymmetryResults[asymmetryResults.length - 1];
              setState((prev) => ({ ...prev, lastAsymmetry: latest }));

              // Transmit telemetry (fire-and-forget — errors are logged via EventBus)
              const payload = buildPayload(
                sessionId.current,
                newReps,
                latest,
                deriveRecommendedPads(latest),
                DEFAULT_PROTOCOL
              );
              transmitWithRetry(payload).catch(() => {
                // Transmission failure already emitted to EventBus
              });
            }
          }
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
  }, []);

  const onStreamError = useCallback((error: Error) => {
    setState((prev) => ({
      ...prev,
      isStreaming: false,
      error: error.message,
    }));
  }, []);

  const onStreamInterrupted = useCallback(() => {
    setState((prev) => ({ ...prev, isStreaming: false }));
  }, []);

  // Cleanup on unmount — release all in-memory buffers
  useEffect(() => {
    return () => {
      poseEngineRef.current?.destroy();
      poseEngineRef.current = null;
      outlierDetectorRef.current.reset();
      allRepsRef.current = [];
      resetWarningRate();
      PipelineEventBus.reset();
    };
  }, [resetWarningRate]);

  return {
    state,
    onStreamReady,
    onStreamError,
    onStreamInterrupted,
  };
}