import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tenfold/shared", "@tenfold/game-engine", "@tenfold/bot"],
  ...(process.env.TENFOLD_SITES_BUILD === "true" ? {} : { output: "standalone" as const }),
};

export default nextConfig;
