import { describe, expect, it, vi } from "vitest";

import exampleRequest from "@/lib/contracts-examples/telemetry.request.example.json";
import type { MovementTelemetry } from "@globe/contracts";

import { assertTelemetryRequestValid } from "./telemetryRequestValidatorImpl";
import { buildTelemetryRequest } from "./buildTelemetryRequest";

describe("buildTelemetryRequest", () => {
  it("matches schema with default stub movement and generated sessionId", () => {
    const fixed = new Date("2026-04-18T17:35:42.000Z");
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "4db6d0f8-d7f0-4f6d-9ff3-4a58d5c6fe19"
    );

    const req = buildTelemetryRequest({ now: fixed });

    expect(req.schemaVersion).toBe("1.0.0");
    expect(req.sessionId).toBe("4db6d0f8-d7f0-4f6d-9ff3-4a58d5c6fe19");
    expect(req.timestamp).toBe("2026-04-18T17:35:42.000Z");
    expect(req.movements).toHaveLength(1);
    expect(req.movements[0].movementType).toBe("squat");
    expect(req.movements[0].captureWindow.endedAt).toBe(
      "2026-04-18T17:35:42.000Z"
    );
    expect(req.movements[0].captureWindow.startedAt).toBe(
      "2026-04-18T17:35:36.000Z"
    );
    expect(req.movements[0].captureWindow.durationMs).toBe(6000);

    assertTelemetryRequestValid(req);

    vi.mocked(crypto.randomUUID).mockRestore();
  });

  it("uses provided sessionId and preserves custom movements unchanged", () => {
    const movements = exampleRequest.movements as MovementTelemetry[];
    const req = buildTelemetryRequest({
      sessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      movements,
    });

    expect(req.sessionId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(req.movements).toEqual(movements);
    assertTelemetryRequestValid(req);
  });

  it("top-level timestamp matches captureWindow.endedAt for default stub", () => {
    const now = new Date("2026-01-02T03:04:05.678Z");
    const req = buildTelemetryRequest({
      now,
      sessionId: "00000000-0000-4000-8000-000000000001",
    });

    expect(req.timestamp).toBe(now.toISOString());
    expect(req.movements[0].captureWindow.endedAt).toBe(now.toISOString());
  });
});
