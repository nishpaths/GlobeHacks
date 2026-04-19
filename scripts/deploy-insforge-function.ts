import { build } from "esbuild";
import { resolve } from "node:path";

import { TELEMETRY_FUNCTION_SLUG } from "@/lib/constants";
import { InsforgeAdminClient } from "@/lib/insforge-admin";
import { InsforgeHttpError } from "@/lib/insforge-api";
import { getRuntimeConfig } from "@/lib/runtime-config";

async function bundleFunction(baseUrl: string) {
  const entryPoint = resolve(
    process.cwd(),
    "insforge/functions/telemetry-ingest/index.ts"
  );

  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    define: {
      INSFORGE_BASE_URL: JSON.stringify(baseUrl)
    }
  });

  const output = result.outputFiles[0];
  if (!output) {
    throw new Error("Failed to bundle the telemetry edge function.");
  }

  return output.text;
}

async function main() {
  const config = getRuntimeConfig();
  if (!config.adminApiKey) {
    throw new Error("Missing INSFORGE admin API key.");
  }

  const code = await bundleFunction(config.baseUrl);
  const admin = new InsforgeAdminClient(config.baseUrl, config.adminApiKey);
  const definition = {
    name: "Recovery Telemetry Ingest",
    slug: config.functionSlug ?? TELEMETRY_FUNCTION_SLUG,
    description:
      "Validates telemetry payloads, persists recovery history, and returns backend-owned protocol suggestions.",
    code,
    status: "active" as const
  };

  try {
    await admin.getFunction(definition.slug);
    await admin.updateFunction(definition.slug, {
      name: definition.name,
      description: definition.description,
      code: definition.code,
      status: definition.status
    });
    console.log(`Updated InsForge function '${definition.slug}'.`);
  } catch (error) {
    if (error instanceof InsforgeHttpError && error.status === 404) {
      await admin.createFunction(definition);
      console.log(`Created InsForge function '${definition.slug}'.`);
      return;
    }

    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
