import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@dentalcare/config": path.resolve(__dirname, "packages/config/src/index.ts"),
      "@dentalcare/contracts": path.resolve(__dirname, "packages/contracts/src/index.ts"),
      "@dentalcare/domain": path.resolve(__dirname, "packages/domain/src/index.ts"),
      "@dentalcare/application": path.resolve(__dirname, "packages/application/src/index.ts"),
      "@dentalcare/db": path.resolve(__dirname, "packages/db/src/index.ts"),
      "@dentalcare/test-utils": path.resolve(__dirname, "packages/test-utils/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["tests/e2e/**", "**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
});
