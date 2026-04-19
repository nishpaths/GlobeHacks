import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

import telemetrySchema from "@/lib/telemetry.schema.json";

import type {
  TelemetryIngestRequest,
  TelemetryIngestResponse,
  MovementTelemetry,
  ProtocolSuggestion
} from "@/lib/contracts-telemetry";

export type {
  TelemetryIngestRequest,
  TelemetryIngestResponse,
  MovementTelemetry,
  ProtocolSuggestion
} from "@/lib/contracts-telemetry";

export { TELEMETRY_SCHEMA_VERSION } from "@/lib/contracts-telemetry";

const ajv = new Ajv2020({
  allErrors: true,
  strict: false
});

addFormats(ajv);

const validator = ajv.compile<TelemetryIngestRequest>(telemetrySchema);

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors: string[];
}

export function validateTelemetryRequest(
  payload: unknown
): ValidationResult<TelemetryIngestRequest> {
  const valid = validator(payload);

  if (valid) {
    return {
      valid: true,
      data: payload as TelemetryIngestRequest,
      errors: []
    };
  }

  return {
    valid: false,
    errors:
      validator.errors?.map((error) => {
        const path = error.instancePath || "payload";
        return `${path} ${error.message ?? "is invalid"}`.trim();
      }) ?? ["payload is invalid"]
  };
}
