import { NextRequest, NextResponse } from "next/server";
import { validatePayload, deserializePayload } from "@/modules/telemetrySerialiser";
import type { TelemetryPayload, SerialiserError } from "@/types/pipeline";

/**
 * POST /api/telemetry
 *
 * Accepts a TelemetryPayload JSON body, validates it, and persists it.
 * Returns HTTP 201 on success, HTTP 400 on validation failure.
 *
 * Note: Database persistence is stubbed — replace the TODO block with
 * your InsForge Postgres client when the DB connection is configured.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Reject non-HTTPS in production
  if (process.env.NODE_ENV === "production") {
    const proto =
      request.headers.get("x-forwarded-proto") ??
      new URL(request.url).protocol.replace(":", "");
    if (proto !== "https") {
      return NextResponse.json(
        { error: "HTTPS required" },
        { status: 400 }
      );
    }
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return NextResponse.json({ error: "Failed to read request body" }, { status: 400 });
  }

  // Deserialise and validate
  const result = deserializePayload(body);
  if ("type" in (result as SerialiserError)) {
    const err = result as SerialiserError;
    return NextResponse.json(
      { error: err.message, field: err.field },
      { status: 400 }
    );
  }

  const payload = result as TelemetryPayload;
  const validationErr = validatePayload(payload);
  if (validationErr) {
    return NextResponse.json(
      { error: validationErr.message, field: validationErr.field },
      { status: 400 }
    );
  }

  // TODO: Persist to InsForge Postgres database
  // Example:
  //   await db.insert(telemetrySessions).values({
  //     sessionId: payload.sessionId,
  //     timestamp: new Date(payload.timestamp),
  //     data: payload,
  //   });

  // Log for development visibility
  if (process.env.NODE_ENV !== "production") {
    console.log("[/api/telemetry] Session stored:", payload.sessionId);
  }

  return NextResponse.json(
    { message: "Telemetry stored successfully", sessionId: payload.sessionId },
    { status: 201 }
  );
}
