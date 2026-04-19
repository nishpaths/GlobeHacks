import { OutlierDetector } from "@/modules/outlierDetector";
import { createConfig } from "@/config/pipelineConfig";
import type { ValidatedAngleFrame } from "@/types/pipeline";

// Minimal config for fast tests
const testConfig = createConfig({
  RESTING_ANGLE_CALIBRATION_FRAMES: 3,
  RETURN_TO_NEUTRAL_OFFSET_DEG: 20,
  MIN_VALID_ANGLES_PER_REP: 3,
  ASYMMETRY_THRESHOLD_DEG: 10,
  RING_BUFFER_CAPACITY: 300,
  JOINTS: [
    { name: "left_knee", proximal: 23, center: 25, distal: 27 },
    { name: "right_knee", proximal: 24, center: 26, distal: 28 },
  ],
  KINETIC_CHAINS: [{ joint: "knee", left: "left_knee", right: "right_knee" }],
});

function makeFrame(angles: Record<string, number | null>, ts = 0): ValidatedAngleFrame {
  const angleMap: ValidatedAngleFrame["angles"] = {};
  const warnings: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(angles)) {
    angleMap[k] = { angle2D: v, angle3D: v };
    warnings[k] = false;
  }
  return { frameTimestamp: ts, angles: angleMap, alignmentWarnings: warnings };
}

function feedCalibration(detector: OutlierDetector, angle = 10): void {
  // Feed RESTING_ANGLE_CALIBRATION_FRAMES (3) frames at resting angle
  for (let i = 0; i < 3; i++) {
    detector.processFrame(makeFrame({ left_knee: angle, right_knee: angle }));
  }
}

describe("OutlierDetector", () => {
  it("detects a repetition and computes maxFlexion", () => {
    const detector = new OutlierDetector(testConfig);
    feedCalibration(detector, 10); // resting = 10, threshold = 30

    // Simulate a squat: rise above 30, then return below 30
    const reps: import("@/types/pipeline").RepetitionResult[] = [];
    const angles = [35, 50, 70, 80, 60, 40, 25]; // peak = 80, ends below 30
    for (const a of angles) {
      const r = detector.processFrame(makeFrame({ left_knee: a, right_knee: a }));
      reps.push(...r);
    }

    expect(reps.length).toBeGreaterThanOrEqual(1);
    const leftRep = reps.find((r) => r.joint === "left_knee");
    expect(leftRep).toBeDefined();
    expect(leftRep!.maxFlexion).toBe(80);
  });

  it("discards repetitions with fewer than MIN_VALID_ANGLES_PER_REP valid values", () => {
    const detector = new OutlierDetector(testConfig);
    feedCalibration(detector, 10);

    // Neutral threshold = resting(10) + offset(20) = 30.
    // Feed 2 frames above 30 (35, 40), then drop below (25).
    // The return-to-neutral frame is NOT included in the series,
    // so series = [35, 40] → 2 valid values < MIN_VALID_ANGLES_PER_REP(3) → discarded.
    const reps: import("@/types/pipeline").RepetitionResult[] = [];
    for (const a of [35, 40, 25]) {
      reps.push(...detector.processFrame(makeFrame({ left_knee: a, right_knee: a })));
    }

    const leftRep = reps.find((r) => r.joint === "left_knee");
    expect(leftRep).toBeUndefined();
  });

  it("computes asymmetry delta correctly", () => {
    const detector = new OutlierDetector(testConfig);
    const leftRep = { joint: "left_knee", angleSeries: [70], maxFlexion: 70 };
    const rightRep = { joint: "right_knee", angleSeries: [55], maxFlexion: 55 };

    const asymmetry = detector.getAsymmetry([leftRep, rightRep]);
    expect(asymmetry).toHaveLength(1);
    expect(asymmetry[0].delta).toBeCloseTo(15, 5);
    expect(asymmetry[0].thresholdExceeded).toBe(true); // 15 > 10
  });

  it("does not flag asymmetry when delta is below threshold", () => {
    const detector = new OutlierDetector(testConfig);
    const leftRep = { joint: "left_knee", angleSeries: [70], maxFlexion: 70 };
    const rightRep = { joint: "right_knee", angleSeries: [65], maxFlexion: 65 };

    const asymmetry = detector.getAsymmetry([leftRep, rightRep]);
    expect(asymmetry[0].thresholdExceeded).toBe(false); // 5 <= 10
  });

  it("reset() clears all state", () => {
    const detector = new OutlierDetector(testConfig);
    feedCalibration(detector, 10);
    detector.processFrame(makeFrame({ left_knee: 50, right_knee: 50 }));
    detector.reset();

    // After reset, calibration should restart — no reps should be emitted
    // for the same sequence that would have triggered one before
    const reps = detector.processFrame(makeFrame({ left_knee: 50, right_knee: 50 }));
    expect(reps).toHaveLength(0);
  });
});
