import type { Landmark, LandmarkSet, AngleFrame, JointConfig } from "@/types/pipeline";

/**
 * Compute the interior angle at `center` using only (x, y) coordinates.
 * Returns degrees in [0.0, 180.0].
 */
export function compute2DAngle(
  proximal: Pick<Landmark, "x" | "y">,
  center: Pick<Landmark, "x" | "y">,
  distal: Pick<Landmark, "x" | "y">
): number {
  const v1x = proximal.x - center.x;
  const v1y = proximal.y - center.y;
  const v2x = distal.x - center.x;
  const v2y = distal.y - center.y;

  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);

  if (mag1 === 0 || mag2 === 0) return 0;

  // Clamp to [-1, 1] to guard against floating-point rounding outside acos domain
  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

/**
 * Compute the interior angle at `center` using (x, y, z) coordinates.
 * Uses the dot-product formula on unit vectors. Returns degrees in [0.0, 180.0].
 */
export function compute3DAngle(
  proximal: Landmark,
  center: Landmark,
  distal: Landmark
): number {
  const v1x = proximal.x - center.x;
  const v1y = proximal.y - center.y;
  const v1z = proximal.z - center.z;
  const v2x = distal.x - center.x;
  const v2y = distal.y - center.y;
  const v2z = distal.z - center.z;

  const dot = v1x * v2x + v1y * v2y + v1z * v2z;
  const mag1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z);
  const mag2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z);

  if (mag1 === 0 || mag2 === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

/**
 * Compute an AngleFrame from a LandmarkSet for all configured joints.
 * Landmarks below confidenceThreshold produce null angles (null propagation).
 */
export function computeAngleFrame(
  landmarkSet: LandmarkSet,
  joints: readonly JointConfig[],
  confidenceThreshold: number
): AngleFrame {
  const angles: AngleFrame["angles"] = {};

  for (const joint of joints) {
    const proximal = landmarkSet.landmarks[joint.proximal];
    const center = landmarkSet.landmarks[joint.center];
    const distal = landmarkSet.landmarks[joint.distal];

    // Null propagation: any low-confidence landmark → null for both angles
    if (
      !proximal ||
      !center ||
      !distal ||
      proximal.visibility < confidenceThreshold ||
      center.visibility < confidenceThreshold ||
      distal.visibility < confidenceThreshold
    ) {
      angles[joint.name] = { angle2D: null, angle3D: null };
      continue;
    }

    angles[joint.name] = {
      angle2D: compute2DAngle(proximal, center, distal),
      angle3D: compute3DAngle(proximal, center, distal),
    };
  }

  return {
    frameTimestamp: landmarkSet.frameTimestamp,
    angles,
  };
}
