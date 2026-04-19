import type {
  TelemetryPayload,
  RepetitionResult,
  AsymmetryResult,
  PadRecord,
  ProtocolRecord,
  SerialiserError,
} from "@/types/pipeline";
import PipelineEventBus from "@/lib/pipelineEventBus";
import { type PipelineConfigType, PipelineConfig } from "@/config/pipelineConfig";

// Required top-level fields in a TelemetryPayload
const REQUIRED_FIELDS: (keyof TelemetryPayload)[] = [
  "sessionId",
  "timestamp",
  "movements",
  "asymmetry",
  "recommendedPads",
  "protocolSuggestion",
  "recoveryProfileId",
];

/** Demo bypass: hardcoded patient profile UUID used until auth is implemented. */
const DEMO_RECOVERY_PROFILE_ID = "22222222-2222-2222-2222-222222222222";

/**
 * Build a TelemetryPayload from pipeline outputs.
 * recommendedPads and protocolSuggestion are derived from the asymmetry result.
 */
export function buildPayload(
  sessionId: string,
  reps: RepetitionResult[],
  asymmetry: AsymmetryResult,
  recommendedPads: PadRecord[],
  protocolSuggestion: ProtocolRecord
): TelemetryPayload {
  return {
    sessionId,
    timestamp: new Date().toISOString(),
    recoveryProfileId: DEMO_RECOVERY_PROFILE_ID,
    movements: reps.map((r) => ({
      joint: r.joint,
      angleSeries: r.angleSeries,
      maxFlexion: r.maxFlexion,
    })),
    asymmetry: {
      joint: asymmetry.joint,
      left: asymmetry.left,
      right: asymmetry.right,
      delta: asymmetry.delta,
      thresholdExceeded: asymmetry.thresholdExceeded,
    },
    recommendedPads,
    protocolSuggestion,
  };
}

/**
 * Validate that all required fields are present and non-null.
 * Returns null on success, or a SerialiserError describing the first missing field.
 */
export function validatePayload(
  payload: Partial<TelemetryPayload>
): SerialiserError | null {
  for (const field of REQUIRED_FIELDS) {
    if (payload[field] === undefined || payload[field] === null) {
      const err: SerialiserError = {
        type: "validation-error",
        message: `Required field "${field}" is missing or null`,
        field,
      };
      PipelineEventBus.emit("serialisation-error", err);
      return err;
    }
  }
  return null;
}

/** Serialise a TelemetryPayload to a JSON string. */
export function serializePayload(payload: TelemetryPayload): string {
  return JSON.stringify(payload);
}

/**
 * Deserialise a JSON string back to a TelemetryPayload.
 * Validates field presence and basic range constraints.
 * Returns a SerialiserError on failure.
 */
export function deserializePayload(
  json: string
): TelemetryPayload | SerialiserError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {
      type: "serialisation-error",
      message: "Invalid JSON string",
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { type: "serialisation-error", message: "Payload must be a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (obj[field] === undefined || obj[field] === null) {
      return {
        type: "validation-error",
        message: `Required field "${field}" is missing or null`,
        field,
      };
    }
  }

  // Validate sessionId is a non-empty string
  if (typeof obj.sessionId !== "string" || obj.sessionId.trim() === "") {
    return { type: "validation-error", message: "Field \"sessionId\" must be a non-empty string", field: "sessionId" };
  }

  // Validate timestamp is a valid ISO 8601 string
  if (typeof obj.timestamp !== "string" || isNaN(Date.parse(obj.timestamp))) {
    return { type: "validation-error", message: "Field \"timestamp\" must be a valid ISO 8601 date string", field: "timestamp" };
  }

  // Validate movements is an array
  if (!Array.isArray(obj.movements)) {
    return { type: "validation-error", message: "Field \"movements\" must be an array", field: "movements" };
  }

  // Validate asymmetry delta is non-negative
  const asym = obj.asymmetry as Record<string, unknown>;
  if (typeof asym?.delta === "number" && asym.delta < 0) {
    return { type: "validation-error", message: "Field \"asymmetry.delta\" must be >= 0", field: "asymmetry" };
  }

  return parsed as TelemetryPayload;
}

/** Sleep helper for retry backoff. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Transmit a TelemetryPayload to POST /api/telemetry with exponential backoff retry.
 * Throws after all retries are exhausted.
 */
export async function transmitWithRetry(
  payload: TelemetryPayload,
  config: Pick<
    PipelineConfigType,
    "RETRY_MAX_ATTEMPTS" | "RETRY_BASE_DELAY_MS"
  > = PipelineConfig
): Promise<Response> {
  // Enforce HTTPS in production
  if (
    typeof window !== "undefined" &&
    window.location.protocol !== "https:" &&
    process.env.NODE_ENV === "production"
  ) {
    const err: SerialiserError = {
      type: "transmission-failure",
      message: "Telemetry transmission requires HTTPS",
    };
    PipelineEventBus.emit("transmission-failure", err);
    throw new Error(err.message);
  }

  const validationErr = validatePayload(payload);
  if (validationErr) throw new Error(validationErr.message);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: serializePayload(payload),
      });

      if (response.ok) return response;

      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < config.RETRY_MAX_ATTEMPTS) {
      await sleep(config.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
    }
  }

  const failureErr: SerialiserError = {
    type: "transmission-failure",
    message: `All ${config.RETRY_MAX_ATTEMPTS} transmission attempts failed: ${lastError?.message}`,
  };
  PipelineEventBus.emit("transmission-failure", failureErr);
  throw new Error(failureErr.message);
}