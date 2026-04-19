"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import PipelineEventBus from "@/lib/pipelineEventBus";
import { PipelineConfig } from "@/config/pipelineConfig";

/**
 * Tracks per-joint alignment warning rate over a sliding window.
 * When any joint's warning rate exceeds 50% in the last 3 seconds (90 frames),
 * sets showRepositioningGuidance = true and emits repositioning-guidance event.
 */
export function useAlignmentWarningRate() {
  const [showRepositioningGuidance, setShowRepositioningGuidance] = useState(false);

  // Per-joint circular boolean buffer: 1 = warning, 0 = no warning
  const windowsRef = useRef<Map<string, Uint8Array>>(new Map());
  const writeIndexRef = useRef<Map<string, number>>(new Map());
  const countRef = useRef<Map<string, number>>(new Map());

  const windowSize = PipelineConfig.ALIGNMENT_WARNING_WINDOW_FRAMES; // 90
  const rateThreshold = PipelineConfig.ALIGNMENT_WARNING_RATE_THRESHOLD; // 0.5

  const handleAlignmentWarning = useCallback(
    (payload: { joint: string }) => {
      const { joint } = payload;

      // Initialise buffer for this joint if needed
      if (!windowsRef.current.has(joint)) {
        windowsRef.current.set(joint, new Uint8Array(windowSize));
        writeIndexRef.current.set(joint, 0);
        countRef.current.set(joint, 0);
      }

      const buf = windowsRef.current.get(joint)!;
      const idx = writeIndexRef.current.get(joint)!;
      const count = countRef.current.get(joint)!;

      // Write a "1" (warning) into the current slot
      buf[idx] = 1;
      writeIndexRef.current.set(joint, (idx + 1) % windowSize);
      countRef.current.set(joint, Math.min(count + 1, windowSize));

      // Compute warning rate over the filled portion of the window
      const filled = countRef.current.get(joint)!;
      let warningCount = 0;
      for (let i = 0; i < filled; i++) warningCount += buf[i];
      const rate = warningCount / filled;

      if (rate > rateThreshold) {
        setShowRepositioningGuidance(true);
        PipelineEventBus.emit("repositioning-guidance", { joint, rate });
      }
    },
    [windowSize, rateThreshold]
  );

  // Record a "no-warning" frame for a joint (called each frame without a warning)
  const recordNoWarning = useCallback(
    (joint: string) => {
      if (!windowsRef.current.has(joint)) {
        windowsRef.current.set(joint, new Uint8Array(windowSize));
        writeIndexRef.current.set(joint, 0);
        countRef.current.set(joint, 0);
      }

      const buf = windowsRef.current.get(joint)!;
      const idx = writeIndexRef.current.get(joint)!;
      const count = countRef.current.get(joint)!;

      buf[idx] = 0;
      writeIndexRef.current.set(joint, (idx + 1) % windowSize);
      countRef.current.set(joint, Math.min(count + 1, windowSize));

      // Re-evaluate: if rate drops below threshold, hide guidance
      const filled = countRef.current.get(joint)!;
      let warningCount = 0;
      for (let i = 0; i < filled; i++) warningCount += buf[i];
      const rate = warningCount / filled;

      if (rate <= rateThreshold) {
        setShowRepositioningGuidance(false);
      }
    },
    [windowSize, rateThreshold]
  );

  useEffect(() => {
    PipelineEventBus.on("alignment-warning", handleAlignmentWarning);
    return () => {
      PipelineEventBus.off("alignment-warning", handleAlignmentWarning);
    };
  }, [handleAlignmentWarning]);

  const reset = useCallback(() => {
    windowsRef.current.clear();
    writeIndexRef.current.clear();
    countRef.current.clear();
    setShowRepositioningGuidance(false);
  }, []);

  return { showRepositioningGuidance, recordNoWarning, reset };
}