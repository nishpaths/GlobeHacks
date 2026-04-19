import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@globe/contracts": path.resolve(__dirname, "../contracts/telemetry.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
});
