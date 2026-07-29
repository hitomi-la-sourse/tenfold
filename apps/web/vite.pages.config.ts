import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "/tenfold/",
  root: resolve(import.meta.dirname, "pages-static"),
  publicDir: resolve(import.meta.dirname, "public"),
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname),
      "next/image": resolve(import.meta.dirname, "pages-static/shims/image.tsx"),
      "next/navigation": resolve(import.meta.dirname, "pages-static/shims/navigation.ts"),
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, "dist-pages"),
    emptyOutDir: true,
  },
});
