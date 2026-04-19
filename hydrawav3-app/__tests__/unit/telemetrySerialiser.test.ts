import {
  buildPayload,
  validatePayload,
  serializePayload,
  deserializePayload,
  transmitWithRetry,
} from "@/modules/telemetrySerialiser";
import PipelineEventBus from "@/lib/pipelineEventBus";
import type { TelemetryPayload, PadRecord, ProtocolRecord, RepetitionResult, AsymmetryResult } from "@/types/pipeline";

beforeEach(() => {
  PipelineEventBus.reset();
});

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

const REPS: RepetitionResult[] = [
  { joint: "left_knee", angleSeries: [45, 60, 70], maxFlexion: 70 },
  { joint: "right_knee", angleSeries: [40, 55, 60], maxFlexion: 60 },
];

const ASYMMETRY: AsymmetryResult = {
  joint: "knee",
  left: 70,
  right: 60,
  delta: 10,
  thresholdExceeded: true,
};

const PADS: PadRecord[] = [
  { pad: "Sun", position: { x: 0.45, y: 0.62 }, muscle: "left quadriceps" },
];

const PROTOCOL: ProtocolRecord = {
  thermalCycleSeconds: 9,
  photobiomodulation: { red: 660, blue: 450 },
  mechanicalFrequencyHz: 40,
};

function makePayload(): TelemetryPayload {
  return buildPayload(SESSION_ID, REPS, ASYMMETRY, PADS, PROTOCOL);
}

describe("buildPayload", () => {
  it("constructs a payload with all required fields", () => {
    const p = makePayload();
    expect(p.sessionId).toBe(SESSION_ID);
    expect(p.movements).toHaveLength(2);
    expect(p.asymmetry.delta).toBe(10);
    expect(p.recommendedPads).toHaveLength(1);
    expect(p.protocolSuggestion.thermalCycleSeconds).toBe(9);
    expect(typeof p.timestamp).toBe("string");
    expect(new Date(p.timestamp).toISOString()).toBe(p.timestamp);
  });
});

describe("validatePayload", () => {
  it("returns null for a valid payload", () => {
    expect(validatePayload(makePayload())).toBeNull();
  });

  it("returns an error when a required field is missing", () => {
    const p = makePayload() as Partial<TelemetryPayload>;
    delete p.asymmetry;
    const err = validatePayload(p);
    expect(err).not.toBeNull();
    expect(err!.field).toBe("asymmetry");
  });

  it("emits serialisation-error event on validation failure", () => {
    const events: unknown[] = [];
    PipelineEventBus.on("serialisation-error", (e) => events.push(e));
    const p = makePayload() as Partial<TelemetryPayload>;
    delete p.movements;
    validatePayload(p);
    expect(events).toHaveLength(1);
  });
});

describe("serializePayload / deserializePayload round-trip", () => {
  it("round-trips a valid payload", () => {
    const p = makePayload();
    const json = serializePayload(p);
    const result = deserializePayload(json);
    expect("type" in result).toBe(false); // not an error
    expect((result as TelemetryPayload).sessionId).toBe(SESSION_ID);
  });

  it("returns error for invalid JSON", () => {
    const result = deserializePayload("{not valid json");
    expect("type" in result).toBe(true);
  });

  it("returns error for missing required field", () => {
    const p = makePayload() as Partial<TelemetryPayload>;
    delete p.movements;
    const json = JSON.stringify(p);
    const result = deserializePayload(json);
    expect("type" in result).toBe(true);
    expect((result as import("@/types/pipeline").SerialiserError).field).toBe("movements");
  });

  it("serialize(deserialize(serialize(p))) === serialize(p)", () => {
    const p = makePayload();
    const s1 = serializePayload(p);
    const d = deserializePayload(s1) as TelemetryPayload;
    const s2 = serializePayload(d);
    expect(s2).toBe(s1);
  });
});

describe("transmitWithRetry", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("succeeds on first attempt", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, status: 201 });
    const p = makePayload();
    await expect(transmitWithRetry(p, { RETRY_MAX_ATTEMPTS: 3, RETRY_BASE_DELAY_MS: 0 })).resolves.toBeDefined();
  });

  it("retries on failure and succeeds on second attempt", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Server Error" })
      .mockResolvedValueOnce({ ok: true, status: 201 });

    const p = makePayload();
    await expect(transmitWithRetry(p, { RETRY_MAX_ATTEMPTS: 3, RETRY_BASE_DELAY_MS: 0 })).resolves.toBeDefined();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("emits transmission-failure after all retries exhausted", async () => {
    const failures: unknown[] = [];
    PipelineEventBus.on("transmission-failure", (e) => failures.push(e));

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Error" });

    const p = makePayload();
    await expect(
      transmitWithRetry(p, { RETRY_MAX_ATTEMPTS: 3, RETRY_BASE_DELAY_MS: 0 })
    ).rejects.toThrow();

    expect(failures).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
