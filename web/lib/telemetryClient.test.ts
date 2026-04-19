import exampleRequest from "@/lib/contracts-examples/telemetry.request.example.json";
import exampleTelemetryResponse from "@/lib/contracts-examples/telemetry.response.example.json";
import type {
  TelemetryIngestRequest,
  TelemetryIngestResponse,
} from "@globe/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NEXT_PUBLIC_TELEMETRY_API_URL_ENV,
  TelemetryPostError,
  getTelemetryApiUrl,
  postTelemetry,
} from "./telemetryClient";

const samplePayload = exampleRequest as TelemetryIngestRequest;

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("getTelemetryApiUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns undefined when blank", () => {
    vi.stubEnv(NEXT_PUBLIC_TELEMETRY_API_URL_ENV, "");
    expect(getTelemetryApiUrl()).toBeUndefined();
  });

  it("returns trimmed URL when set", () => {
    vi.stubEnv(NEXT_PUBLIC_TELEMETRY_API_URL_ENV, "  https://api.test/t  ");
    expect(getTelemetryApiUrl()).toBe("https://api.test/t");
  });
});

describe("postTelemetry (mock / offline)", () => {
  beforeEach(() => {
    vi.stubEnv(NEXT_PUBLIC_TELEMETRY_API_URL_ENV, "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns mock success matching example response when URL env is unset", async () => {
    const res = await postTelemetry(samplePayload);

    expect(res.success).toBe(exampleTelemetryResponse.success);
    expect(res.message).toBe(exampleTelemetryResponse.message);
    expect(res.sessionId).toBe(samplePayload.sessionId);
    expect(Number.isNaN(Date.parse(res.createdAt))).toBe(false);
  });

  it("does not call fetch in mock mode", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await postTelemetry(samplePayload);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("postTelemetry (HTTP)", () => {
  const apiUrl = "https://api.example.com/api/telemetry";

  beforeEach(() => {
    vi.stubEnv(NEXT_PUBLIC_TELEMETRY_API_URL_ENV, apiUrl);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("POSTs JSON and returns parsed body", async () => {
    const body: TelemetryIngestResponse = {
      success: true,
      message: "ok",
      sessionId: samplePayload.sessionId,
      createdAt: "2026-04-18T12:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal("fetch", fetchMock);

    const res = await postTelemetry(samplePayload);

    expect(res).toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(apiUrl);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(init.body).toBe(JSON.stringify(samplePayload));
  });

  it("throws TelemetryPostError with kind http on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 502 }))
    );

    await expect(postTelemetry(samplePayload)).rejects.toMatchObject({
      name: "TelemetryPostError",
      kind: "http",
      status: 502,
    });
  });

  it("throws TelemetryPostError with kind parse on invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not json", { status: 200 }))
    );

    await expect(postTelemetry(samplePayload)).rejects.toMatchObject({
      name: "TelemetryPostError",
      kind: "parse",
    });
  });

  it("throws TelemetryPostError with kind parse on wrong JSON shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ success: true }))
    );

    await expect(postTelemetry(samplePayload)).rejects.toMatchObject({
      name: "TelemetryPostError",
      kind: "parse",
    });
  });

  it("throws TelemetryPostError with kind network when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(postTelemetry(samplePayload)).rejects.toMatchObject({
      name: "TelemetryPostError",
      kind: "network",
    });
  });

  it("rejects with TelemetryPostError on HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 500 }))
    );

    await expect(postTelemetry(samplePayload)).rejects.toBeInstanceOf(
      TelemetryPostError
    );
  });
});
