import type { TelemetryIngestRequest } from "@globe/contracts";

/**
 * In `next dev` / `NODE_ENV === "development"`, validates `payload` against
 * `contracts/telemetry.schema.json` using Ajv. No-op in production builds.
 *
 * Implemented via a dynamic import so the Ajv bundle is not loaded in production.
 */
export async function validateTelemetryRequestInDev(
  payload: TelemetryIngestRequest
): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;
  const { assertTelemetryRequestValid } = await import("./telemetryRequestValidatorImpl");
  assertTelemetryRequestValid(payload);
}
