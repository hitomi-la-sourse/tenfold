import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  outDir: "dist",
  splitting: false,
  sourcemap: true,
  clean: true,
  noExternal: ["@tenfold/game-engine", "@tenfold/bot", "@tenfold/shared"],
});
