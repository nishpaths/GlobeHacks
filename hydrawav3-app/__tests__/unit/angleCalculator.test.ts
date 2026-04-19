import { compute2DAngle, compute3DAngle, computeAngleFrame } from "@/modules/angleCalculator";
import { PipelineConfig } from "@/config/pipelineConfig";
import type { LandmarkSet } from "@/types/pipeline";

function makeLandmark(x: number, y: number, z: number, visibility = 1.0) {
  return { x, y, z, visibility };
}

describe("compute2DAngle", () => {
  it("returns 90° for a right-angle triplet", () => {
    // center at origin, proximal up, distal right → 90°
    const angle = compute2DAngle(
      { x: 0, y: 1 },
      { x: 0, y: 0 },
      { x: 1, y: 0 }
    );
    expect(angle).toBeCloseTo(90, 1);
  });

  it("returns 180° for collinear landmarks (straight line)", () => {
    const angle = compute2DAngle(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    );
    expect(angle).toBeCloseTo(180, 1);
  });

  it("returns 0° when proximal and distal are at the same position as center", () => {
    const angle = compute2DAngle(
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 }
    );
    expect(angle).toBe(0);
  });

  it("always returns a value in [0, 180]", () => {
    const angle = compute2DAngle(
      { x: 0.3, y: 0.7 },
      { x: 0.5, y: 0.5 },
      { x: 0.8, y: 0.2 }
    );
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThanOrEqual(180);
  });
});

describe("compute3DAngle", () => {
  it("returns 90° for a right-angle triplet in 3D", () => {
    const angle = compute3DAngle(
      makeLandmark(0, 1, 0),
      makeLandmark(0, 0, 0),
      makeLandmark(1, 0, 0)
    );
    expect(angle).toBeCloseTo(90, 1);
  });

  it("returns 180° for collinear 3D landmarks", () => {
    const angle = compute3DAngle(
      makeLandmark(0, 0, 0),
      makeLandmark(1, 0, 0),
      makeLandmark(2, 0, 0)
    );
    expect(angle).toBeCloseTo(180, 1);
  });

  it("always returns a value in [0, 180]", () => {
    const angle = compute3DAngle(
      makeLandmark(0.1, 0.9, 0.05),
      makeLandmark(0.5, 0.5, 0.0),
      makeLandmark(0.9, 0.2, -0.05)
    );
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThanOrEqual(180);
  });
});

describe("computeAngleFrame", () => {
  function makeLandmarkSet(overrides: Partial<Record<number, ReturnType<typeof makeLandmark>>> = {}): LandmarkSet {
    const landmarks = Array.from({ length: 33 }, (_, i) =>
      overrides[i] ?? makeLandmark(0.5, 0.5, 0.0, 1.0)
    );
    return { landmarks, frameTimestamp: 1000 };
  }

  it("produces angle results for all 8 configured joints", () => {
    const frame = computeAngleFrame(
      makeLandmarkSet(),
      PipelineConfig.JOINTS,
      PipelineConfig.POSE_CONFIDENCE_THRESHOLD
    );
    const jointNames = PipelineConfig.JOINTS.map((j) => j.name);
    for (const name of jointNames) {
      expect(frame.angles).toHaveProperty(name);
    }
  });

  it("returns null angles when any landmark in a triplet is low-confidence", () => {
    // left_knee uses landmarks 23 (proximal), 25 (center), 27 (distal)
    const landmarkSet = makeLandmarkSet({
      25: makeLandmark(0.5, 0.5, 0.0, 0.3), // center below threshold
    });
    const frame = computeAngleFrame(
      landmarkSet,
      PipelineConfig.JOINTS,
      PipelineConfig.POSE_CONFIDENCE_THRESHOLD
    );
    expect(frame.angles["left_knee"].angle2D).toBeNull();
    expect(frame.angles["left_knee"].angle3D).toBeNull();
  });

  it("returns non-null angles when all landmarks are high-confidence", () => {
    const frame = computeAngleFrame(
      makeLandmarkSet(),
      PipelineConfig.JOINTS,
      PipelineConfig.POSE_CONFIDENCE_THRESHOLD
    );
    // With all landmarks at (0.5, 0.5, 0) the vectors are zero-length → angle = 0
    // but it should not be null
    expect(frame.angles["left_knee"].angle2D).not.toBeNull();
  });

  it("preserves the frameTimestamp from the LandmarkSet", () => {
    const ls = makeLandmarkSet();
    ls.frameTimestamp = 42000;
    const frame = computeAngleFrame(ls, PipelineConfig.JOINTS, 0.5);
    expect(frame.frameTimestamp).toBe(42000);
  });
});
