import {
    DEFAULT_PROTOCOL_SUGGESTION,
    PROTOCOL_BOUNDS,
    TELEMETRY_AI_MODEL
  } from "@/lib/constants";
  import type {
    MovementTelemetry,
    ProtocolSuggestion
  } from "@/lib/telemetry-contract";
  import type {
    InsforgeApiClient,
    InsforgeChatMessage
  } from "@/lib/insforge-api";
  
  export interface HistoricalMovementSummary {
    movementType: string;
    capturedAt: string;
    alignmentValidated: boolean;
    asymmetryAnalysis: MovementTelemetry["asymmetryAnalysis"];
    protocolSuggestion: ProtocolSuggestion | null;
  }
  
  export interface ProtocolGenerationResult {
    protocolSuggestion: ProtocolSuggestion;
    source: "ai" | "history_fallback" | "default_fallback";
    modelName: string | null;
    clampedFields: string[];
    historySessionCount: number;
    explanation?: string;
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
  
  function parseProtocolSuggestion(raw: string): ProtocolSuggestion & { explanation?: string } {
    const parsed = JSON.parse(extractJsonObject(raw)) as ProtocolSuggestion & { explanation?: string };
    if (
      typeof parsed?.thermalCycleSeconds !== "number" ||
      typeof parsed?.mechanicalFrequencyHz !== "number" ||
      typeof parsed?.photobiomodulation?.redNm !== "number" ||
      typeof parsed?.photobiomodulation?.blueNm !== "number"
    ) {
      throw new Error("AI response did not match the protocol contract.");
    }
  
    return parsed;
  }
  
  function clamp(
    value: number,
    min: number,
    max: number
  ): { value: number; clamped: boolean } {
    const next = Math.min(Math.max(value, min), max);
    return {
      value: next,
      clamped: next !== value
    };
  }
  
  export function clampProtocolSuggestion(protocol: ProtocolSuggestion): {
    protocolSuggestion: ProtocolSuggestion;
    clampedFields: string[];
  } {
    const clampedFields: string[] = [];
  
    const thermal = clamp(
      protocol.thermalCycleSeconds,
      PROTOCOL_BOUNDS.thermalCycleSeconds.min,
      PROTOCOL_BOUNDS.thermalCycleSeconds.max
    );
    if (thermal.clamped) {
      clampedFields.push("thermalCycleSeconds");
    }
  
    const red = clamp(
      protocol.photobiomodulation.redNm,
      PROTOCOL_BOUNDS.photobiomodulation.redNm.min,
      PROTOCOL_BOUNDS.photobiomodulation.redNm.max
    );
    if (red.clamped) {
      clampedFields.push("photobiomodulation.redNm");
    }
  
    const blue = clamp(
      protocol.photobiomodulation.blueNm,
      PROTOCOL_BOUNDS.photobiomodulation.blueNm.min,
      PROTOCOL_BOUNDS.photobiomodulation.blueNm.max
    );
    if (blue.clamped) {
      clampedFields.push("photobiomodulation.blueNm");
    }
  
    const frequency = clamp(
      protocol.mechanicalFrequencyHz,
      PROTOCOL_BOUNDS.mechanicalFrequencyHz.min,
      PROTOCOL_BOUNDS.mechanicalFrequencyHz.max
    );
    if (frequency.clamped) {
      clampedFields.push("mechanicalFrequencyHz");
    }
  
    return {
      protocolSuggestion: {
        thermalCycleSeconds: thermal.value,
        photobiomodulation: {
          redNm: red.value,
          blueNm: blue.value
        },
        mechanicalFrequencyHz: frequency.value
      },
      clampedFields
    };
  }
  
  function selectHistoryFallback(
    history: HistoricalMovementSummary[]
  ): ProtocolSuggestion | null {
    for (const item of history) {
      if (item.protocolSuggestion) {
        return item.protocolSuggestion;
      }
    }
  
    return null;
  }
  
  function buildPrompt(
    movement: MovementTelemetry,
    history: HistoricalMovementSummary[]
  ): InsforgeChatMessage[] {
    const historySummary =
      history.length === 0
        ? "No prior sessions are available for this recovery profile."
        : JSON.stringify(history, null, 2);
  
    return [
      {
        role: "system",
        content:
         `You generate Hydrawav3 recovery protocol settings. Return JSON only with this exact shape: {"thermalCycleSeconds": number, "photobiomodulation": {"redNm": number, "blueNm": number}, "mechanicalFrequencyHz": number, "explanation": "A strict 1-2 sentence clinical justification for why these settings were chosen based on the asymmetry."}.
          STRICT CALCULATION RUBRIC:
          1. Thermal Cycle (thermalCycleSeconds): 
            - Base value is 60. 
            - If any asymmetry indicator has \`thresholdExceeded: true\` and a \`delta\` > 10, set to 120. 
            - If \`delta\` is between 5 and 10, set to 90.

          2. Photobiomodulation (redNm / blueNm):
            - Base values: redNm = 630, blueNm = 450.
            - If the \`recommendedPads\` array targets a large muscle group (e.g., "quadriceps", "hamstrings", "glutes"), prioritize deep tissue repair: set redNm = 660.
            - If the target is a joint or tendon area (e.g., "knee", "rotator_cuff", "shoulder"), prioritize inflammation reduction: set blueNm = 470.

          3. Mechanical Frequency (mechanicalFrequencyHz):
            - Base value is 20.
            - If \`thresholdExceeded\` is true, scale the frequency up: 32 for moderate asymmetry (delta 5-15), and 40 for severe asymmetry (delta > 15).`
      },
      {
        role: "user",
        content:
          "Create recovery-focused settings for this movement. Use the current " +
          "movement indicators and recent history. Do not add commentary.\n\n" +
          `Current movement:\n${JSON.stringify(movement, null, 2)}\n\n` +
          `Recent history:\n${historySummary}\n`
      }
    ];
  }
  
  export async function generateProtocolSuggestion(
    apiClient: Pick<InsforgeApiClient, "chatCompletion">,
    movement: MovementTelemetry,
    history: HistoricalMovementSummary[]
  ): Promise<ProtocolGenerationResult> {
    const historyFallback = selectHistoryFallback(history);
  
    try {
      const completion = await apiClient.chatCompletion({
        model: TELEMETRY_AI_MODEL,
        messages: buildPrompt(movement, history),
        temperature: 0.2,
        maxTokens: 300
      });
  
      const parsed = parseProtocolSuggestion(completion.response);
      const clamped = clampProtocolSuggestion(parsed);
  
      return {
        protocolSuggestion: clamped.protocolSuggestion,
        source: "ai",
        modelName: completion.model ?? TELEMETRY_AI_MODEL,
        clampedFields: clamped.clampedFields,
        historySessionCount: history.length,
        explanation: parsed.explanation
      };
    } catch {
      if (historyFallback) {
        return {
          protocolSuggestion: historyFallback,
          source: "history_fallback",
          modelName: null,
          clampedFields: [],
          historySessionCount: history.length,
          explanation: "AI generation failed. Applying safe settings from your last successful session."
        };
      }
  
      return {
        protocolSuggestion: DEFAULT_PROTOCOL_SUGGESTION,
        source: "default_fallback",
        modelName: null,
        clampedFields: [],
        historySessionCount: history.length,
        explanation: "Applying standard baseline recovery protocol."
      };
    }
  }