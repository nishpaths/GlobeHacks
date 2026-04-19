import { getRuntimeConfig } from "@/lib/runtime-config";
import { InsforgeAdminClient } from "@/lib/insforge-admin";

async function main() {
  const config = getRuntimeConfig();
  if (!config.adminApiKey) {
    throw new Error("Missing INSFORGE_ADMIN_API_KEY or .insforge/project.json api_key.");
  }

  const admin = new InsforgeAdminClient(config.baseUrl, config.adminApiKey);
  const metadata = await admin.getMetadata();
  console.log(
    JSON.stringify(
      {
        baseUrl: config.baseUrl,
        environment: metadata.environment,
        name: metadata.name,
        timestamp: metadata.timestamp
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
