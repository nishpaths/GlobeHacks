import { describe, expect, it } from "vitest";

import type { MovementResult } from "./movementPipeline";
import { movementResultToTelemetryMovement } from "./movementPipeline";

describe("movementResultToTelemetryMovement", () => {
  it("maps joints to jointTelemetry and strips non-contract fields", () => {
    const result: MovementResult = {
      movementType: "squat",
      captureWindow: {
        startedAt: "2026-04-18T17:35:36.000Z",
        endedAt: "2026-04-18T17:35:42.000Z",
        durationMs: 6000,
      },
      repCount: 1,
      joints: {
        left_knee: {
          angleSeries: [180, 90],
          maxFlexion: 90,
          visibilityMean: 0.92,
        },
      },
      alignmentValidated: true,
      asymmetryAnalysis: [],
      recommendedPads: [],
      protocolSuggestion: {
        thermalCycleSeconds: 60,
        photobiomodulation: { redNm: 660, blueNm: 470 },
        mechanicalFrequencyHz: 30,
      },
    };

    const movement = movementResultToTelemetryMovement(result);

    expect(movement.jointTelemetry.left_knee).toEqual({
      angleSeries: [180, 90],
      maxFlexion: 90,
    });
    expect(
      movement.jointTelemetry.left_knee as { visibilityMean?: number }
    ).not.toHaveProperty("visibilityMean");
  });
});
