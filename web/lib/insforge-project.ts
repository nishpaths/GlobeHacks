import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface InsforgeProjectConfig {
  baseUrl: string | null;
  apiKey: string | null;
  legacyApiKey: string | null;
}

export function readInsforgeProjectConfig(): InsforgeProjectConfig {
  const candidatePaths = [
    resolve(process.cwd(), ".insforge", "project.json"),
    resolve(process.cwd(), "..", ".insforge", "project.json"),
  ];

  for (const candidatePath of candidatePaths) {
    if (!existsSync(candidatePath)) continue;

    const projectConfig = JSON.parse(readFileSync(candidatePath, "utf-8")) as {
      oss_host?: string;
      INSFORGE_BASE_URL?: string;
      api_key?: string;
      INSFORGE_API_KEY?: string;
    };

    return {
      baseUrl: projectConfig.INSFORGE_BASE_URL ?? projectConfig.oss_host ?? null,
      apiKey: projectConfig.INSFORGE_API_KEY ?? null,
      legacyApiKey: projectConfig.api_key ?? null,
    };
  }

  return {
    baseUrl: null,
    apiKey: null,
    legacyApiKey: null,
  };
}
