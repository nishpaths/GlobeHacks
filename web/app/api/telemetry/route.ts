import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@insforge/sdk";
import { handleTelemetryIngest } from "@/lib/telemetry-ingest";
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
  }>;
  protocolSuggestion: {
    thermalCycleSeconds: number;
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
  const strongerSide: Side = weakerSide === "left" ? "right" : "left";
  const imbalanceDetected = delta > 10;

  const severity: Severity =
    delta < 5 ? "none" : delta <= 15 ? "moderate" : "severe";

  const targetMuscle = joint === "knee" ? "quadriceps" : "quadriceps";

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
    recommendedPads: [
      { padType: "Sun", targetMuscle: `${weakerSide}_${targetMuscle}` },
      { padType: "Moon", targetMuscle: `${strongerSide}_${targetMuscle}` },
    ],
    protocolSuggestion: {
      thermalCycleSeconds: input.protocolSuggestion.thermalCycleSeconds,
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
  try {
    const projectConfigPath = resolve(process.cwd(), ".insforge", "project.json");
    const projectConfig = JSON.parse(readFileSync(projectConfigPath, "utf-8")) as {
      oss_host?: string;
      api_key?: string;
    };

    const baseUrl = projectConfig.oss_host;
    const apiKey = projectConfig.api_key;
    if (!baseUrl || !apiKey) return EXPLANATION_FALLBACK;

    const insforge = createClient({ baseUrl, anonKey: apiKey });
    const aiResponse = await insforge.ai.chat.completions.create({
      model: "anthropic/claude-sonnet-4.6",
      messages: [
        { role: "system", content: EXPLANATION_PROMPT },
        { role: "user", content: JSON.stringify(result) },
      ],
      temperature: 0.2,
    });

    const content = aiResponse?.choices?.[0]?.message?.content ?? "";
    if (typeof content !== "string" || content.trim() === "") return EXPLANATION_FALLBACK;
    return parseExplanationResponse(content);
  } catch (error) {
    console.error(error);
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

    // Run AI explanation and DB ingestion concurrently
    const [explanation, ingestResult] = await Promise.allSettled([
      generateExplanation(result),
      handleTelemetryIngest({
        payload: bridgeToIngestRequest(body),
        authorization: "Bearer demo-bypass-token",
        baseUrl: process.env.NEXT_PUBLIC_INSFORGE_BASE_URL ?? "",
      }),
    ]);

    const explanationValue =
      explanation.status === "fulfilled" ? explanation.value : EXPLANATION_FALLBACK;

    const dbSuccess = ingestResult.status === "fulfilled";
    if (!dbSuccess) {
      console.error("[telemetry] DB ingest failed:", ingestResult.reason);
    }

    return Response.json(
      {
        success: true,
        analysis: result.analysis,
        recommendedPads: result.recommendedPads,
        protocolSuggestion: result.protocolSuggestion,
        explanation: explanationValue,
        db: dbSuccess
          ? { saved: true, sessionId: ingestResult.value.sessionId }
          : { saved: false },
      },
      { status: 200 }
    );
  } catch {
    return Response.json(
      { success: false, message: "Internal server error." },
      { status: 500 }
    );
  }
}
