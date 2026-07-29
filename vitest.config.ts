import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
      include: ["packages/game-engine/src/**", "packages/shared/src/**"],
    },
  },
});
