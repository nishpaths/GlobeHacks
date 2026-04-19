import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  handleTelemetryIngest,
  TelemetryHttpError
} from "@/lib/telemetry-ingest";
import {
  clampProtocolSuggestion,
  generateProtocolSuggestion
} from "@/lib/protocol-engine";
import { validateTelemetryRequest } from "@/lib/telemetry-contract";

const exampleRequestPath = resolve(
  process.cwd(),
  "contracts/examples/telemetry.request.example.json"
);

const mockAuthorization =
  "Bearer " +
  [
    "header",
    Buffer.from(
      JSON.stringify({
        sub: "e7d46a6f-58a7-4870-bb0d-977694637734",
        role: "authenticated"
      })
    ).toString("base64url"),
    "signature"
  ].join(".");

async function loadExampleRequest() {
  return JSON.parse(await readFile(exampleRequestPath, "utf-8")) as Record<
    string,
    unknown
  >;
}

test("example request matches the updated telemetry contract", async () => {
  const payload = await loadExampleRequest();
  const result = validateTelemetryRequest(payload);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("request validation rejects client-provided protocol suggestions", async () => {
  const payload = await loadExampleRequest();
  const movement = payload.movements as Array<Record<string, unknown>>;
  movement[0].protocolSuggestion = {
    thermalCycleSeconds: 90,
    photobiomodulation: {
      redNm: 660,
      blueNm: 470
    },
    mechanicalFrequencyHz: 32
  };

  const result = validateTelemetryRequest(payload);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((error) =>
      error.includes("must NOT have additional properties")
    )
  );
});

test("protocol clamping keeps AI output inside the approved Hydrawav3 bounds", () => {
  const clamped = clampProtocolSuggestion({
    thermalCycleSeconds: 150,
    photobiomodulation: {
      redNm: 700,
      blueNm: 420
    },
    mechanicalFrequencyHz: 55
  });

  assert.deepEqual(clamped.protocolSuggestion, {
    thermalCycleSeconds: 120,
    photobiomodulation: {
      redNm: 660,
      blueNm: 450
    },
    mechanicalFrequencyHz: 40
  });
  assert.deepEqual(clamped.clampedFields.sort(), [
    "mechanicalFrequencyHz",
    "photobiomodulation.blueNm",
    "photobiomodulation.redNm",
    "thermalCycleSeconds"
  ]);
});

test("protocol generation falls back to history when AI output is unusable", async () => {
  const result = await generateProtocolSuggestion(
    {
      chatCompletion: async () => ({
        response: "not-json"
      })
    },
    {
      movementType: "squat",
      captureWindow: {
        startedAt: "2026-04-18T17:35:36Z",
        endedAt: "2026-04-18T17:35:42Z",
        durationMs: 6000
      },
      repCount: 3,
      jointTelemetry: {
        left_knee: {
          angleSeries: [110, 95],
          maxFlexion: 95
        }
      },
      alignmentValidated: true,
      asymmetryAnalysis: [],
      recommendedPads: []
    },
    [
      {
        movementType: "squat",
        capturedAt: "2026-04-17T12:00:00Z",
        alignmentValidated: true,
        asymmetryAnalysis: [],
        protocolSuggestion: {
          thermalCycleSeconds: 88,
          photobiomodulation: {
            redNm: 650,
            blueNm: 460
          },
          mechanicalFrequencyHz: 30
        }
      }
    ]
  );

  assert.equal(result.source, "history_fallback");
  assert.deepEqual(result.protocolSuggestion, {
    thermalCycleSeconds: 88,
    photobiomodulation: {
      redNm: 650,
      blueNm: 460
    },
    mechanicalFrequencyHz: 30
  });
});

test("telemetry ingest builds the backend-owned response shape", async () => {
  const payload = await loadExampleRequest();
  const writes: Array<{ table: string; rows: Array<Record<string, unknown>> }> = [];

  const response = await handleTelemetryIngest({
    payload,
    authorization: mockAuthorization,
    baseUrl: "https://example.insforge.app",
    now: () => "2026-04-18T17:35:43Z",
    apiClient: {
      queryRecords: async <T>(
        table: string,
        params: Record<string, string | number | undefined>
      ) => {
        if (table === "clinic_staff") {
          return [
            {
              id: "membership-1",
              clinic_id: "c9d8f4c4-0490-4dc0-a96b-aeb52811d7d4",
              role: "staff"
            }
          ] as T[];
        }

        if (table === "recovery_profiles") {
          return [] as T[];
        }

        if (
          table === "recovery_sessions" &&
          typeof params.id === "string" &&
          params.id.startsWith("eq.")
        ) {
          return [] as T[];
        }

        if (table === "recovery_sessions") {
          return [] as T[];
        }

        if (
          table === "session_movements" ||
          table === "asymmetry_indicators" ||
          table === "protocol_recommendations"
        ) {
          return [] as T[];
        }

        return [] as T[];
      },
      createRecords: async <T extends Record<string, unknown>>(
        table: string,
        rows: T[]
      ) => {
        writes.push({ table, rows });
        return rows;
      },
      chatCompletion: async () => ({
        response: JSON.stringify({
          thermalCycleSeconds: 90,
          photobiomodulation: {
            redNm: 660,
            blueNm: 470
          },
          mechanicalFrequencyHz: 32
        }),
        model: "openai/gpt-4o-mini"
      })
    }
  });

  assert.equal(response.success, true);
  assert.equal(response.sessionId, payload.sessionId);
  assert.equal(response.recoveryProfileId, payload.recoveryProfileId);
  assert.equal(response.createdAt, "2026-04-18T17:35:43Z");
  assert.deepEqual(response.movementRecommendations, [
    {
      movementType: "squat",
      protocolSuggestion: {
        thermalCycleSeconds: 90,
        photobiomodulation: {
          redNm: 660,
          blueNm: 470
        },
        mechanicalFrequencyHz: 32
      }
    }
  ]);
  assert.ok(writes.some((entry) => entry.table === "recovery_sessions"));
  assert.ok(writes.some((entry) => entry.table === "protocol_recommendations"));
});

test("telemetry ingest rejects unauthenticated requests", async () => {
  const payload = await loadExampleRequest();

  await assert.rejects(
    () =>
      handleTelemetryIngest({
        payload,
        authorization: null,
        baseUrl: "https://example.insforge.app"
      }),
    (error: unknown) => {
      assert.ok(error instanceof TelemetryHttpError);
      assert.equal(error.status, 401);
      return true;
    }
  );
});
