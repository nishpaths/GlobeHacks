// Shared TypeScript interfaces for the Sensor & Telemetry Pipeline

export interface Landmark {
    x: number; // normalised [0, 1]
    y: number; // normalised [0, 1]
    z: number; // depth estimate, same scale as x
    visibility: number; // confidence [0, 1]
  }
  
  export interface LandmarkSet {
    landmarks: Landmark[]; // always length 33
    frameTimestamp: number; // performance.now()
  }
  
  export interface AngleResult {
    angle2D: number | null; // degrees [0, 180] or null if low-confidence/warned
    angle3D: number | null; // degrees [0, 180] or null if low-confidence/warned
  }
  
  export interface AngleFrame {
    frameTimestamp: number;
    angles: Record<string, AngleResult>; // keyed by joint name
  }
  
  export interface ValidatedAngleFrame extends AngleFrame {
    alignmentWarnings: Record<string, boolean>; // true = warning emitted for that joint
  }
  
  export interface RepetitionResult {
    joint: string;
    angleSeries: number[];
    maxFlexion: number;
  }
  
  export interface AsymmetryResult {
    joint: string; // e.g. "knee"
    left: number; // left maxFlexion
    right: number; // right maxFlexion
    delta: number; // |left - right|
    thresholdExceeded: boolean;
  }
  
  export interface MovementRecord {
    joint: string;
    angleSeries: number[];
    maxFlexion: number;
  }
  
  export interface AsymmetryRecord {
    joint: string;
    left: number;
    right: number;
    delta: number;
    thresholdExceeded: boolean;
  }
  
  export interface PadRecord {
    padType: "Sun" | "Moon";
    position: { x: number; y: number };
    targetMuscle: string;
  }
  
  export interface ProtocolRecord {
    thermalCycleSeconds: number;
    photobiomodulation: { red: number; blue: number };
    mechanicalFrequencyHz: number;
  }
  
  export interface TelemetryPayload {
    sessionId: string; // UUID v4
    timestamp: string; // ISO 8601 UTC
    movements: MovementRecord[];
    asymmetry: AsymmetryRecord;
    recommendedPads: PadRecord[];
    protocolSuggestion: ProtocolRecord;
    /** Demo bypass: hardcoded patient profile UUID. */
    recoveryProfileId: string;
  }
  
  export interface SerialiserError {
    type: "serialisation-error" | "validation-error" | "transmission-failure";
    message: string;
    field?: string;
  }

  export interface PipelineDebugEvent {
    type: PipelineEventType;
    message: string;
    at: string;
  }
  
  export type PipelineEventType =
    | "camera-permission-denied"
    | "stream-interrupted"
    | "pose-engine-init-failure"
    | "low-confidence-landmark"
    | "alignment-warning"
    | "repositioning-guidance"
    | "repetition-discarded"
    | "serialisation-error"
    | "transmission-failure";
  
  export interface JointConfig {
    name: string;
    proximal: number; // MediaPipe landmark index
    center: number;
    distal: number;
  }
  
  export interface KineticChainConfig {
    joint: string; // e.g. "knee"
    left: string; // joint name e.g. "left_knee"
    right: string;
  }
