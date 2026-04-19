import type { AngleFrame, ValidatedAngleFrame } from "@/types/pipeline";
import PipelineEventBus from "@/lib/pipelineEventBus";

/**
 * Stage 2 – Alignment Validation (pure function).
 *
 * For each joint: if both angle2D and angle3D are non-null and
 * |angle2D − angle3D| > threshold, emits an alignment-warning event,
 * sets alignmentWarnings[joint] = true, and nulls both angles in the output
 * so the OutlierDetector excludes that frame.
 */
export function validateAlignment(
  frame: AngleFrame,
  threshold: number
): ValidatedAngleFrame {
  const outputAngles: ValidatedAngleFrame["angles"] = {};
  const alignmentWarnings: Record<string, boolean> = {};

  for (const [jointName, result] of Object.entries(frame.angles)) {
    const { angle2D, angle3D } = result;

    if (
      angle2D !== null &&
      angle3D !== null &&
      Math.abs(angle2D - angle3D) > threshold
    ) {
      // Emit warning and null out angles so downstream sees null
      alignmentWarnings[jointName] = true;
      outputAngles[jointName] = { angle2D: null, angle3D: null };
      PipelineEventBus.emit("alignment-warning", { joint: jointName, angle2D, angle3D, threshold });
    } else {
      alignmentWarnings[jointName] = false;
      outputAngles[jointName] = { angle2D, angle3D };
    }
  }

  return {
    frameTimestamp: frame.frameTimestamp,
    angles: outputAngles,
    alignmentWarnings,
  };
}