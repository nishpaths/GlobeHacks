import { handleTelemetryIngest, TelemetryHttpError } from "../../../lib/telemetry-ingest";

declare const INSFORGE_BASE_URL: string;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

export default async function (request: Request) {
  if (request.method !== "POST") {
    return jsonResponse(405, {
      success: false,
      message: "Method not allowed."
    });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, {
      success: false,
      message: "Request body must be valid JSON."
    });
  }

  try {
    const response = await handleTelemetryIngest({
      payload,
      authorization: request.headers.get("authorization"),
      baseUrl: INSFORGE_BASE_URL
    });

    return jsonResponse(201, response as unknown as Record<string, unknown>);
  } catch (err) {
    if (err instanceof TelemetryHttpError) {
      return jsonResponse(err.status, err.body);
    }

    return jsonResponse(500, {
      success: false,
      message: "Unexpected telemetry ingest failure."
    });
  }
}