import type { TelemetryIngestRequest, TelemetryIngestResponse } from "@globe/contracts";
import exampleTelemetryResponse from "@/lib/contracts-examples/telemetry.response.example.json";

/** Public env: full URL for `POST` telemetry ingest (e.g. `https://api.example.com/api/telemetry`). */
export const NEXT_PUBLIC_TELEMETRY_API_URL_ENV = "NEXT_PUBLIC_TELEMETRY_API_URL" as const;

export type TelemetryPostErrorKind = "network" | "http" | "parse";

export class TelemetryPostError extends Error {
  readonly kind: TelemetryPostErrorKind;
  readonly status?: number;
  readonly responseBody?: string;

  constructor(
    message: string,
    kind: TelemetryPostErrorKind,
    options?: { status?: number; responseBody?: string; cause?: unknown }
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "TelemetryPostError";
    this.kind = kind;
    this.status = options?.status;
    this.responseBody = options?.responseBody;
  }
}

export function getTelemetryApiUrl(): string | undefined {
  const raw = process.env[NEXT_PUBLIC_TELEMETRY_API_URL_ENV];
  if (raw === undefined || raw.trim() === "") return undefined;
  return raw.trim();
}

function isTelemetryIngestResponse(value: unknown): value is TelemetryIngestResponse {
  if (value === null || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.success === "boolean" &&
    typeof o.message === "string" &&
    typeof o.sessionId === "string" &&
    typeof o.createdAt === "string"
  );
}

function mockTelemetrySuccess(
  payload: TelemetryIngestRequest
): TelemetryIngestResponse {
  return {
    ...exampleTelemetryResponse,
    sessionId: payload.sessionId,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Sends `POST` JSON to `NEXT_PUBLIC_TELEMETRY_API_URL`, or returns a mock success
 * when that env is unset (hackathon / offline UI flows).
 */
export async function postTelemetry(
  payload: TelemetryIngestRequest
): Promise<TelemetryIngestResponse> {
  const url = getTelemetryApiUrl();
  if (!url) {
    return mockTelemetrySuccess(payload);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Network request failed";
    throw new TelemetryPostError(message, "network", { cause });
  }

  const text = await res.text();

  if (!res.ok) {
    throw new TelemetryPostError(
      `Telemetry request failed (${res.status})`,
      "http",
      { status: res.status, responseBody: text }
    );
  }

  let parsed: unknown;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch (cause) {
    throw new TelemetryPostError(
      "Telemetry response was not valid JSON",
      "parse",
      { cause, responseBody: text, status: res.status }
    );
  }

  if (!isTelemetryIngestResponse(parsed)) {
    throw new TelemetryPostError(
      "Telemetry response JSON did not match the expected shape",
      "parse",
      { responseBody: text }
    );
  }

  return parsed;
}
