import type { JointConfig, KineticChainConfig } from "@/types/pipeline";

// MediaPipe Pose landmark indices:
// https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
// 11=left_shoulder, 12=right_shoulder, 13=left_elbow, 14=right_elbow
// 15=left_wrist, 16=right_wrist, 23=left_hip, 24=right_hip
// 25=left_knee, 26=right_knee, 27=left_ankle, 28=right_ankle
// 31=left_foot_index, 32=right_foot_index

export interface PipelineConfigType {
  ALIGNMENT_THRESHOLD_DEG: number;
  ASYMMETRY_THRESHOLD_DEG: number;
  RETURN_TO_NEUTRAL_OFFSET_DEG: number;
  MIN_VALID_ANGLES_PER_REP: number;
  POSE_CONFIDENCE_THRESHOLD: number;
  TARGET_FPS: number;
  WEBCAM_WIDTH: number;
  WEBCAM_HEIGHT: number;
  RETRY_MAX_ATTEMPTS: number;
  RETRY_BASE_DELAY_MS: number;
  RESTING_ANGLE_CALIBRATION_FRAMES: number;
  RING_BUFFER_CAPACITY: number;
  ALIGNMENT_WARNING_WINDOW_FRAMES: number;
  ALIGNMENT_WARNING_RATE_THRESHOLD: number;
  JOINTS: JointConfig[];
  KINETIC_CHAINS: KineticChainConfig[];
}

const BASE_CONFIG: PipelineConfigType = {
  // Stage 2 – Alignment Validation threshold (degrees)
  ALIGNMENT_THRESHOLD_DEG: 15,
  // Stage 3 – Asymmetry detection threshold (degrees)
  ASYMMETRY_THRESHOLD_DEG: 10,
  // Repetition boundary: degrees above resting angle to count as "in motion"
  RETURN_TO_NEUTRAL_OFFSET_DEG: 20,
  // Minimum valid angle values required to count a repetition
  MIN_VALID_ANGLES_PER_REP: 3,
  // MediaPipe landmark visibility below this → low-confidence
  POSE_CONFIDENCE_THRESHOLD: 0.5,
  // Target frame rate
  TARGET_FPS: 30,
  // Webcam capture resolution
  WEBCAM_WIDTH: 640,
  WEBCAM_HEIGHT: 480,
  // Telemetry transmission retry config
  RETRY_MAX_ATTEMPTS: 3,
  RETRY_BASE_DELAY_MS: 1000,
  // Resting angle calibration: number of frames to average
  RESTING_ANGLE_CALIBRATION_FRAMES: 30,
  // Ring buffer capacity (frames): 300 = 10 s at 30 fps
  RING_BUFFER_CAPACITY: 300,
  // Alignment warning sliding window (frames): 90 = 3 s at 30 fps
  ALIGNMENT_WARNING_WINDOW_FRAMES: 90,
  // Warning rate above this triggers repositioning guidance
  ALIGNMENT_WARNING_RATE_THRESHOLD: 0.5,

  JOINTS: [
    { name: "left_knee", proximal: 23, center: 25, distal: 27 },
    { name: "right_knee", proximal: 24, center: 26, distal: 28 },
    { name: "left_hip", proximal: 11, center: 23, distal: 25 },
    { name: "right_hip", proximal: 12, center: 24, distal: 26 },
    { name: "left_elbow", proximal: 11, center: 13, distal: 15 },
    { name: "right_elbow", proximal: 12, center: 14, distal: 16 },
    { name: "left_shoulder", proximal: 13, center: 11, distal: 23 },
    { name: "right_shoulder", proximal: 14, center: 12, distal: 24 },
    { name: "left_ankle", proximal: 25, center: 27, distal: 31 },
    { name: "right_ankle", proximal: 26, center: 28, distal: 32 },
  ] as JointConfig[],

  KINETIC_CHAINS: [
    { joint: "knee", left: "left_knee", right: "right_knee" },
    { joint: "hip", left: "left_hip", right: "right_hip" },
    { joint: "shoulder", left: "left_shoulder", right: "right_shoulder" },
    { joint: "elbow", left: "left_elbow", right: "right_elbow" },
    { joint: "ankle", left: "left_ankle", right: "right_ankle" },
  ] as KineticChainConfig[],
};

// Exported singleton — read-only by all modules
export const PipelineConfig: PipelineConfigType = BASE_CONFIG;

// Factory for test injection — merges overrides without mutating BASE_CONFIG
export function createConfig(
  overrides: Partial<Omit<PipelineConfigType, "JOINTS" | "KINETIC_CHAINS">> & {
    JOINTS?: JointConfig[];
    KINETIC_CHAINS?: KineticChainConfig[];
  }
): PipelineConfigType {
  return {
    ...BASE_CONFIG,
    ...overrides,
    JOINTS: overrides.JOINTS ?? BASE_CONFIG.JOINTS,
    KINETIC_CHAINS: overrides.KINETIC_CHAINS ?? BASE_CONFIG.KINETIC_CHAINS,
  } as PipelineConfigType;
}
