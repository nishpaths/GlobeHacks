import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { TELEMETRY_FUNCTION_SLUG } from "@/lib/constants";

interface LocalProjectConfig {
  oss_host?: string;
  api_key?: string;
}

export interface RuntimeConfig {
  baseUrl: string;
  adminApiKey?: string;
  functionSlug: string;
}

let cachedConfig: RuntimeConfig | null = null;

function readLocalProjectConfig(): LocalProjectConfig {
  const projectPath = resolve(process.cwd(), ".insforge", "project.json");
  if (!existsSync(projectPath)) {
    return {};
  }

  return JSON.parse(readFileSync(projectPath, "utf-8")) as LocalProjectConfig;
}

export function getRuntimeConfig(): RuntimeConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const local = readLocalProjectConfig();
  const baseUrl = process.env.INSFORGE_BASE_URL ?? local.oss_host;

  if (!baseUrl) {
    throw new Error(
      "Missing InsForge base URL. Set INSFORGE_BASE_URL or provide .insforge/project.json."
    );
  }

  cachedConfig = {
    baseUrl,
    adminApiKey: process.env.INSFORGE_ADMIN_API_KEY ?? local.api_key,
    functionSlug:
      process.env.INSFORGE_TELEMETRY_FUNCTION_SLUG ?? TELEMETRY_FUNCTION_SLUG
  };

  return cachedConfig;
}
