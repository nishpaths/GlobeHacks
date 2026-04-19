import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@insforge/sdk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Side = "left" | "right";
type Severity = "none" | "moderate" | "severe";

interface TelemetryInput {
  asymmetry: {
    joint: "knee";
    left: number;
    right: number;
    delta: number;
    thresholdExceeded: boolean;
  };
  protocolSuggestion: {
    thermalCycleSeconds: number;
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
      severity
    },
    recommendedPads: [
      {
        padType: "Sun",
        targetMuscle: `${weakerSide}_${targetMuscle}`
      },
      {
        padType: "Moon",
        targetMuscle: `${strongerSide}_${targetMuscle}`
      }
    ],
    protocolSuggestion: {
      thermalCycleSeconds: input.protocolSuggestion.thermalCycleSeconds,
      mechanicalFrequencyHz
    }
  };
}

function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }

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
    const projectConfig = JSON.parse(
      readFileSync(projectConfigPath, "utf-8")
    ) as {
      oss_host?: string;
      api_key?: string;
    };

    const baseUrl = projectConfig.oss_host;
    const apiKey = projectConfig.api_key;

    if (!baseUrl || !apiKey) {
      return EXPLANATION_FALLBACK;
    }

    const insforge = createClient({
      baseUrl: baseUrl,
      anonKey: apiKey
    });

    const aiResponse = await insforge.ai.chat.completions.create({
      model: "anthropic/claude-sonnet-4.6",
      messages: [
        {
          role: "system",
          content: EXPLANATION_PROMPT
        },
        {
          role: "user",
          content: JSON.stringify(result)
        }
      ],
      temperature: 0.2
    });

    const content =
      aiResponse?.choices?.[0]?.message?.content ?? "";

    if (typeof content !== "string" || content.trim() === "") {
      return EXPLANATION_FALLBACK;
    }

    return parseExplanationResponse(content);
  } catch (error) {
    console.error(error);
    return EXPLANATION_FALLBACK;
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as TelemetryInput;
    const result = processTelemetry(body);
    const explanation = await generateExplanation(result);

    return Response.json(
      {
        success: true,
        analysis: result.analysis,
        recommendedPads: result.recommendedPads,
        protocolSuggestion: result.protocolSuggestion,
        explanation
      },
      { status: 200 }
    );
  } catch {
    return Response.json(
      {
        success: false,
        message: "Internal server error."
      },
      { status: 500 }
    );
  }
}