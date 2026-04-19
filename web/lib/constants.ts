import type { ProtocolSuggestion } from "@globe/contracts";

export const TELEMETRY_FUNCTION_SLUG = "telemetry-ingest";
export const TELEMETRY_AI_MODEL = "anthropic/claude-sonnet-4.6";

export const PROTOCOL_BOUNDS = {
  thermalCycleSeconds: {
    min: 60,
    max: 120
  },
  photobiomodulation: {
    redNm: {
      min: 630,
      max: 660
    },
    blueNm: {
      min: 450,
      max: 470
    }
  },
  mechanicalFrequencyHz: {
    min: 20,
    max: 40
  }
} as const;

export const DEFAULT_PROTOCOL_SUGGESTION: ProtocolSuggestion = {
  thermalCycleSeconds: 90,
  photobiomodulation: {
    redNm: 660,
    blueNm: 470
  },
  mechanicalFrequencyHz: 32
};
