import type {
  AsymmetryIndicator,
  CaptureWindow,
  JointTelemetry,
  MovementTelemetry,
  ProtocolSuggestion,
  RecommendedPad,
} from "@globe/contracts";

/**
 * Per-joint output from the pose / tracking layer before API serialization.
 * Extra optional fields can be added for solver-specific metadata without
 * changing {@link MovementTelemetry}.
 */
export interface JointTrackingResult {
  angleSeries: number[];
  maxFlexion: number;
  /** Average landmark visibility in [0, 1] when the pose solver exposes it. */
  visibilityMean?: number;
}

/**
 * Narrow internal result produced by the movement pipeline (e.g. MediaPipe +
 * asymmetry logic). Map to {@link MovementTelemetry} for ingest via
 * {@link movementResultToTelemetryMovement}.
 */
export interface MovementResult {
  movementType: string;
  captureWindow: CaptureWindow;
  repCount: number;
  /** Joint-keyed series and flexion peaks from tracking. */
  joints: Record<string, JointTrackingResult>;
  alignmentValidated: boolean;
  asymmetryAnalysis: AsymmetryIndicator[];
  recommendedPads: RecommendedPad[];
  protocolSuggestion: ProtocolSuggestion;
}

/**
 * Converts pipeline output to the wire-format movement object (drops fields
 * that are not part of {@link JointTelemetry}).
 */
export function movementResultToTelemetryMovement(
  result: MovementResult
): MovementTelemetry {
  const jointTelemetry: Record<string, JointTelemetry> = {};
  for (const [key, joint] of Object.entries(result.joints)) {
    jointTelemetry[key] = {
      angleSeries: joint.angleSeries,
      maxFlexion: joint.maxFlexion,
    };
  }

  return {
    movementType: result.movementType,
    captureWindow: result.captureWindow,
    repCount: result.repCount,
    jointTelemetry,
    alignmentValidated: result.alignmentValidated,
    asymmetryAnalysis: result.asymmetryAnalysis,
    recommendedPads: result.recommendedPads,
    protocolSuggestion: result.protocolSuggestion,
  };
}
