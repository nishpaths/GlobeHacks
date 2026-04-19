import { handleTelemetryIngest, TelemetryHttpError } from "@/lib/telemetry-ingest";
import { readInsforgeProjectConfig } from "@/lib/insforge-project";
import { buildPadTargets, getMovementSeverity } from "@/lib/movement-profiles";
import { TELEMETRY_SCHEMA_VERSION } from "@/lib/telemetry-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Side = "left" | "right";
type Severity = "none" | "moderate" | "severe";

// ── Dev 1 payload shape (sent by telemetrySerialiser.ts) ─────────────────────
interface TelemetryInput {
  sessionId: string;
  timestamp: string;
  recoveryProfileId: string;
  asymmetry: {
    joint: string;
    left: number;
    right: number;
    delta: number;
    thresholdExceeded: boolean;
  };
  movements: Array<{
    joint: string;
    angleSeries: number[];
    maxFlexion: number;
  }>;
  recommendedPads: Array<{
    padType: "Sun" | "Moon";
    targetMuscle: string;
    position: { x: number; y: number };
  }>;
  protocolSuggestion: {
    thermalCycleSeconds: number;
    photobiomodulation: { red: number; blue: number };
    mechanicalFrequencyHz: number;
  };
}

interface TelemetryResult {
  analysis: {
    imbalanceDetected: boolean;
    delta: number;
    weakerSide: Side;
    targetMuscle: string;
    severity: Severity;
  };
  recommendedPads: Array<{
    padType: "Sun" | "Moon";
    targetMuscle: string;
    position: { x: number; y: number };
  }>;
  protocolSuggestion: {
    thermalCycleSeconds: number;
    photobiomodulation: { red: number; blue: number };
    mechanicalFrequencyHz: number;
  };
}

const EXPLANATION_FALLBACK =
  "Movement imbalance detected and addressed with targeted support.";

const EXPLANATION_PROMPT = `You are an AI assistant for a recovery and wellness platform.

You are given structured biomechanical analysis data.

Your job is to generate a clear explanation of what was observed and why a recovery suggestion was made.

INPUT DATA INCLUDES:
- weakerSide (left or right)
- delta (movement difference)
- targetMuscle

Rules:
- MUST mention which side is weaker (left or right)
- MUST describe the difference in movement
- MUST explain why that side is being targeted
- MUST explain why the opposite side is stabilized
- Keep it 2-3 sentences
- Use natural language (not robotic)
- DO NOT make medical claims
- DO NOT diagnose
- Use words like:
movement, balance, activation, symmetry, support

Return ONLY:
{
  "explanation": "..."
}`;

function processTelemetry(input: TelemetryInput): TelemetryResult {
  const { joint, left, right } = input.asymmetry;
  const delta = Math.abs(left - right);
  const weakerSide: Side = left <= right ? "left" : "right";
  const imbalanceDetected = delta > 10;
  const severity = getMovementSeverity(delta) as Severity;
  const { targetMuscle, recommendedPads } = buildPadTargets(joint, weakerSide);

  const mechanicalFrequencyHz =
    severity === "none" ? 28 : severity === "moderate" ? 35 : 45;

  return {
    analysis: {
      imbalanceDetected,
      delta,
      weakerSide,
      targetMuscle,
      severity,
    },
    recommendedPads,
    protocolSuggestion: {
      thermalCycleSeconds: input.protocolSuggestion.thermalCycleSeconds,
      photobiomodulation: {
        red: input.protocolSuggestion.photobiomodulation.red,
        blue: input.protocolSuggestion.photobiomodulation.blue,
      },
      mechanicalFrequencyHz,
    },
  };
}

function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) return raw.slice(firstBrace, lastBrace + 1);
  return raw.trim();
}

function parseExplanationResponse(raw: string): string {
  const parsed = JSON.parse(extractJsonObject(raw)) as { explanation?: unknown };
  if (typeof parsed.explanation !== "string" || parsed.explanation.trim() === "") {
    throw new Error("Invalid explanation response.");
  }
  return parsed.explanation.trim();
}

async function generateExplanation(result: TelemetryResult): Promise<string> {
  const { baseUrl, apiKey, legacyApiKey } = readInsforgeProjectConfig();
  const authToken = apiKey ?? legacyApiKey;

  if (!baseUrl || !authToken) {
    return EXPLANATION_FALLBACK;
  }

  let content = "";
  try {
    const response = await fetch(`${baseUrl}/api/ai/chat/completion`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4.6",
        messages: [
          { role: "system", content: EXPLANATION_PROMPT },
          { role: "user", content: JSON.stringify(result) },
        ],
        temperature: 0.2,
        stream: false,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[telemetry] Explanation request failed:", response.status, await response.text());
      return EXPLANATION_FALLBACK;
    }

    const data = (await response.json()) as { text?: string; message?: string };
    content = data.text || data.message || "";
  } catch (error) {
    console.error("LLM failed:", error);
    return EXPLANATION_FALLBACK;
  }

  if (typeof content !== "string" || content.trim() === "") {
    return EXPLANATION_FALLBACK;
  }

  try {
    return parseExplanationResponse(content);
  } catch (error) {
    console.error("LLM failed:", error);
    return EXPLANATION_FALLBACK;
  }
}

/**
 * Bridge Dev 1's TelemetryPayload shape into the TelemetryIngestRequest shape
 * that handleTelemetryIngest / the AJV schema validator expects.
 */
function bridgeToIngestRequest(body: TelemetryInput) {
  const now = new Date().toISOString();
  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    sessionId: body.sessionId,
    timestamp: body.timestamp ?? now,
    recoveryProfileId: body.recoveryProfileId,
    movements: body.movements.map((m) => ({
      movementType: m.joint,
      captureWindow: {
        startedAt: body.timestamp ?? now,
        endedAt: now,
        durationMs: 0,
      },
      repCount: 1,
      jointTelemetry: {
        [m.joint]: {
          angleSeries: m.angleSeries,
          maxFlexion: m.maxFlexion,
        },
      },
      alignmentValidated: true,
      asymmetryAnalysis: [
        {
          jointType: body.asymmetry.joint,
          leftPeak: body.asymmetry.left,
          rightPeak: body.asymmetry.right,
          delta: body.asymmetry.delta,
          thresholdExceeded: body.asymmetry.thresholdExceeded,
        },
      ],
      recommendedPads: body.recommendedPads.map((p) => ({
        padType: p.padType,
        targetMuscle: p.targetMuscle,
        position: p.position,
      })),
      protocolSuggestion: {
        thermalCycleSeconds: body.protocolSuggestion.thermalCycleSeconds,
        photobiomodulation: {
          redNm: body.protocolSuggestion.photobiomodulation.red,
          blueNm: body.protocolSuggestion.photobiomodulation.blue,
        },
        mechanicalFrequencyHz: body.protocolSuggestion.mechanicalFrequencyHz,
      },
    })),
  };
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as TelemetryInput;
    const result = processTelemetry(body);
    const insforgeConfig = readInsforgeProjectConfig();

    if (!insforgeConfig.baseUrl) {
      return Response.json(
        { success: false, message: "InsForge base URL is missing." },
        { status: 500 }
      );
    }

    const explanationPromise = generateExplanation(result);
    const ingestResult = await handleTelemetryIngest({
      payload: bridgeToIngestRequest(body),
      authorization: "Bearer demo-bypass-token",
      baseUrl: insforgeConfig.baseUrl,
    });

    const explanationValue = await explanationPromise;
    const backendProtocolFromIngest =
      ingestResult.movementRecommendations?.[0]?.protocolSuggestion;
    const backendProtocol = backendProtocolFromIngest
      ? {
          thermalCycleSeconds: backendProtocolFromIngest.thermalCycleSeconds,
          photobiomodulation: {
            red: backendProtocolFromIngest.photobiomodulation.redNm,
            blue: backendProtocolFromIngest.photobiomodulation.blueNm,
          },
          mechanicalFrequencyHz: backendProtocolFromIngest.mechanicalFrequencyHz,
        }
      : result.protocolSuggestion;

    return Response.json(
      {
        success: true,
        analysis: result.analysis,
        recommendedPads: result.recommendedPads,
        protocolSuggestion: backendProtocol,
        explanation: explanationValue,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[telemetry] request failed:", error);

    if (error instanceof TelemetryHttpError) {
      return Response.json(error.body, { status: error.status });
    }

    return Response.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Internal server error.",
      },
      { status: 500 }
    );
  }
}
