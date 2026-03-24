import { defineConfig } from "vitest/config";
import path from "path";

const root = path.resolve(__dirname);

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/tests/**/*.test.ts", "apps/**/tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["packages/**/src/**/*.ts", "apps/**/src/**/*.ts"],
      exclude: ["**/index.ts", "**/*.d.ts"],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      "@mss/core": path.join(root, "packages/core/src"),
      "@mss/core/testing": path.join(root, "packages/core/src/testing.ts"),
      "@mss/core/events": path.join(root, "packages/core/src/events"),
      "@mss/core/resources": path.join(root, "packages/core/src/resources"),
      "@mss/core/policies": path.join(root, "packages/core/src/policies"),
      "@mss/core/contracts": path.join(root, "packages/core/src/contracts"),
      "@mss/core/ids": path.join(root, "packages/core/src/ids.ts"),
      "@mss/ledger": path.join(root, "packages/ledger/src"),
      "@mss/voice": path.join(root, "packages/voice/src"),
      "@mss/tools": path.join(root, "packages/tools/src"),
      "@mss/identity": path.join(root, "packages/identity/src"),
      "@mss/gateway": path.join(root, "packages/gateway/src"),
      "@mss/orchestrator": path.join(root, "packages/orchestrator/src"),
      "@mss/worlds": path.join(root, "packages/worlds/src"),
      "@mss/mesh": path.join(root, "packages/mesh/src"),
      "@mss/context-fabric": path.join(root, "packages/context-fabric/src"),
    },
  },
});
