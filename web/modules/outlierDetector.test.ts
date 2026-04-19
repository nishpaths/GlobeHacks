import { describe, expect, it } from "vitest";

import { createConfig } from "@/config/pipelineConfig";
import { OutlierDetector } from "@/modules/outlierDetector";
import type { ValidatedAngleFrame } from "@/types/pipeline";

function frame(left: number, right: number): ValidatedAngleFrame {
  return {
    frameTimestamp: performance.now(),
    alignmentWarnings: {
      left_knee: false,
      right_knee: false,
    },
    angles: {
      left_knee: { angle2D: left, angle3D: left },
      right_knee: { angle2D: right, angle3D: right },
    },
  };
}

describe("OutlierDetector", () => {
  it("detects squat-style reps from decreasing knee angles", () => {
    const detector = new OutlierDetector(
      createConfig({
        JOINTS: [
          { name: "left_knee", proximal: 23, center: 25, distal: 27 },
          { name: "right_knee", proximal: 24, center: 26, distal: 28 },
        ],
        KINETIC_CHAINS: [{ joint: "knee", left: "left_knee", right: "right_knee" }],
        RESTING_ANGLE_CALIBRATION_FRAMES: 1,
        RETURN_TO_NEUTRAL_OFFSET_DEG: 20,
        MIN_VALID_ANGLES_PER_REP: 2,
      }),
    );

    detector.processFrame(frame(170, 170)); // calibration
    expect(detector.processFrame(frame(130, 145))).toEqual([]);
    expect(detector.processFrame(frame(125, 140))).toEqual([]);
    const reps = detector.processFrame(frame(170, 170));

    expect(reps).toHaveLength(2);
    const leftRep = reps.find((rep) => rep.joint === "left_knee");
    const rightRep = reps.find((rep) => rep.joint === "right_knee");
    expect(leftRep?.maxFlexion).toBe(125);
    expect(rightRep?.maxFlexion).toBe(140);

    const asymmetry = detector.getAsymmetry(reps);
    expect(asymmetry[0]).toMatchObject({
      joint: "knee",
      left: 125,
      right: 140,
      delta: 15,
      thresholdExceeded: true,
    });
  });
});
