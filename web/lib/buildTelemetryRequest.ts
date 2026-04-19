import exampleRequest from "@/lib/contracts-examples/telemetry.request.example.json";

import type { MovementTelemetry, TelemetryIngestRequest } from "@globe/contracts";
import { TELEMETRY_SCHEMA_VERSION } from "@globe/contracts";

const stubMovementTemplate = exampleRequest.movements[0] as MovementTelemetry;

export interface BuildTelemetryRequestArgs {
  /** When omitted, `crypto.randomUUID()` is used. */
  sessionId?: string;
  /**
   * Wall clock for top-level `timestamp` and default stub `captureWindow`.
   * Defaults to `new Date()`.
   */
  now?: Date;
  /**
   * When omitted, uses one example-shaped movement from the contract golden file,
   * with `captureWindow` recomputed from `now` so ISO `date-time` fields stay valid.
   */
  movements?: MovementTelemetry[];
}

function alignCaptureWindowToNow(
  movement: MovementTelemetry,
  endedAt: Date,
  durationMs: number
): MovementTelemetry {
  const startedAt = new Date(endedAt.getTime() - durationMs);
  return {
    ...movement,
    captureWindow: {
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs,
    },
  };
}

/**
 * Builds a {@link TelemetryIngestRequest} using the shared contract types.
 * Top-level `timestamp` and default stub `captureWindow.*` use `Date.toISOString()`
 * (RFC 3339 / JSON Schema `date-time`).
 */
export function buildTelemetryRequest(
  args: BuildTelemetryRequestArgs = {}
): TelemetryIngestRequest {
  const now = args.now ?? new Date();
  const sessionId = args.sessionId ?? crypto.randomUUID();

  const movements =
    args.movements ??
    [
      alignCaptureWindowToNow(
        stubMovementTemplate,
        now,
        stubMovementTemplate.captureWindow.durationMs
      ),
    ];

  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    sessionId,
    timestamp: now.toISOString(),
    movements,
  };
}
