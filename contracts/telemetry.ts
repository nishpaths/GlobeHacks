/**
 * Versioned Recovery Intelligence API contract for POST /api/telemetry.
 *
 * This file is intended to be the frontend/backend shared source of truth for
 * request and response typing during the hackathon.
 */

export const TELEMETRY_SCHEMA_VERSION = "1.0.0" as const;

export interface TelemetryIngestRequest {
  schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  sessionId: string;
  timestamp: string;
  movements: MovementTelemetry[];
}

export interface MovementTelemetry {
  movementType: string;
  captureWindow: CaptureWindow;
  repCount: number;
  jointTelemetry: Record<string, JointTelemetry>;
  alignmentValidated: boolean;
  asymmetryAnalysis: AsymmetryIndicator[];
  recommendedPads: RecommendedPad[];
  protocolSuggestion: ProtocolSuggestion;
}

export interface CaptureWindow {
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface JointTelemetry {
  angleSeries: number[];
  maxFlexion: number;
}

export interface AsymmetryIndicator {
  jointType: string;
  leftPeak: number;
  rightPeak: number;
  delta: number;
  thresholdExceeded: boolean;
}

export interface RecommendedPad {
  padType: "Sun" | "Moon";
  targetMuscle: string;
  position: NormalizedPosition;
}

export interface NormalizedPosition {
  x: number;
  y: number;
}

export interface ProtocolSuggestion {
  thermalCycleSeconds: number;
  photobiomodulation: Photobiomodulation;
  mechanicalFrequencyHz: number;
}

export interface Photobiomodulation {
  redNm: number;
  blueNm: number;
}

export interface TelemetryIngestResponse {
  success: boolean;
  message: string;
  sessionId: string;
  createdAt: string;
}
