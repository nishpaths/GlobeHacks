export type MovementSide = "left" | "right";
export type MovementSeverity = "none" | "moderate" | "severe";
export type SupportedMovementJoint =
  | "knee"
  | "hip"
  | "shoulder"
  | "elbow"
  | "ankle";

export interface MovementProfile {
  joint: SupportedMovementJoint;
  primaryMuscle: string;
  secondaryMuscle: string;
  activationY: number;
  stabilizationY: number;
}

const MOVEMENT_PROFILES: Record<SupportedMovementJoint, MovementProfile> = {
  knee: {
    joint: "knee",
    primaryMuscle: "quadriceps",
    secondaryMuscle: "hamstrings",
    activationY: 0.62,
    stabilizationY: 0.62,
  },
  hip: {
    joint: "hip",
    primaryMuscle: "glutes",
    secondaryMuscle: "hip_flexors",
    activationY: 0.54,
    stabilizationY: 0.5,
  },
  shoulder: {
    joint: "shoulder",
    primaryMuscle: "deltoids",
    secondaryMuscle: "rotator_cuff",
    activationY: 0.32,
    stabilizationY: 0.34,
  },
  elbow: {
    joint: "elbow",
    primaryMuscle: "biceps",
    secondaryMuscle: "triceps",
    activationY: 0.45,
    stabilizationY: 0.45,
  },
  ankle: {
    joint: "ankle",
    primaryMuscle: "calves",
    secondaryMuscle: "tibialis",
    activationY: 0.74,
    stabilizationY: 0.72,
  },
};

export function resolveMovementJoint(joint: string): SupportedMovementJoint {
  const normalizedJoint = joint.toLowerCase();

  if (normalizedJoint.includes("shoulder")) return "shoulder";
  if (normalizedJoint.includes("elbow")) return "elbow";
  if (normalizedJoint.includes("ankle")) return "ankle";
  if (normalizedJoint.includes("hip")) return "hip";
  return "knee";
}

export function getMovementProfile(joint: string): MovementProfile {
  return MOVEMENT_PROFILES[resolveMovementJoint(joint)];
}

export function getMovementSeverity(delta: number): MovementSeverity {
  if (delta < 5) return "none";
  if (delta <= 15) return "moderate";
  return "severe";
}

export function buildPadTargets(
  joint: string,
  weakerSide: MovementSide,
): {
  targetMuscle: string;
  recommendedPads: Array<{
    padType: "Sun" | "Moon";
    targetMuscle: string;
    position: { x: number; y: number };
  }>;
} {
  const profile = getMovementProfile(joint);
  const strongerSide: MovementSide = weakerSide === "left" ? "right" : "left";

  return {
    targetMuscle: profile.primaryMuscle,
    recommendedPads: [
      {
        padType: "Sun",
        targetMuscle: `${weakerSide}_${profile.primaryMuscle}`,
        position: {
          x: weakerSide === "left" ? 0.3 : 0.7,
          y: profile.activationY,
        },
      },
      {
        padType: "Moon",
        targetMuscle: `${strongerSide}_${profile.secondaryMuscle}`,
        position: {
          x: strongerSide === "left" ? 0.3 : 0.7,
          y: profile.stabilizationY,
        },
      },
    ],
  };
}
