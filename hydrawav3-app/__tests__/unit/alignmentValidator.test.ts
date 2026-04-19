import { validateAlignment } from "@/modules/alignmentValidator";
import PipelineEventBus from "@/lib/pipelineEventBus";
import type { AngleFrame } from "@/types/pipeline";

function makeFrame(angles: AngleFrame["angles"]): AngleFrame {
  return { frameTimestamp: 1000, angles };
}

beforeEach(() => {
  PipelineEventBus.reset();
});

describe("validateAlignment", () => {
  it("emits alignment-warning and nulls angles when |2D - 3D| > threshold", () => {
    const warnings: unknown[] = [];
    PipelineEventBus.on("alignment-warning", (p) => warnings.push(p));

    const frame = makeFrame({
      left_knee: { angle2D: 80, angle3D: 50 }, // delta = 30 > 15
    });

    const result = validateAlignment(frame, 15);

    expect(result.alignmentWarnings["left_knee"]).toBe(true);
    expect(result.angles["left_knee"].angle2D).toBeNull();
    expect(result.angles["left_knee"].angle3D).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  it("does NOT warn when |2D - 3D| <= threshold", () => {
    const warnings: unknown[] = [];
    PipelineEventBus.on("alignment-warning", (p) => warnings.push(p));

    const frame = makeFrame({
      left_knee: { angle2D: 80, angle3D: 70 }, // delta = 10 <= 15
    });

    const result = validateAlignment(frame, 15);

    expect(result.alignmentWarnings["left_knee"]).toBe(false);
    expect(result.angles["left_knee"].angle2D).toBe(80);
    expect(result.angles["left_knee"].angle3D).toBe(70);
    expect(warnings).toHaveLength(0);
  });

  it("does NOT warn when either angle is null", () => {
    const warnings: unknown[] = [];
    PipelineEventBus.on("alignment-warning", (p) => warnings.push(p));

    const frame = makeFrame({
      left_knee: { angle2D: null, angle3D: 70 },
    });

    const result = validateAlignment(frame, 15);

    expect(result.alignmentWarnings["left_knee"]).toBe(false);
    expect(warnings).toHaveLength(0);
  });

  it("handles multiple joints independently", () => {
    const frame = makeFrame({
      left_knee: { angle2D: 90, angle3D: 60 },  // delta 30 > 15 → warn
      right_knee: { angle2D: 85, angle3D: 80 }, // delta 5 <= 15 → ok
    });

    const result = validateAlignment(frame, 15);

    expect(result.alignmentWarnings["left_knee"]).toBe(true);
    expect(result.alignmentWarnings["right_knee"]).toBe(false);
    expect(result.angles["left_knee"].angle2D).toBeNull();
    expect(result.angles["right_knee"].angle2D).toBe(85);
  });

  it("preserves frameTimestamp", () => {
    const frame = makeFrame({ left_knee: { angle2D: 80, angle3D: 79 } });
    frame.frameTimestamp = 99999;
    const result = validateAlignment(frame, 15);
    expect(result.frameTimestamp).toBe(99999);
  });
});
