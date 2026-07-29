import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tenfold/shared", "@tenfold/game-engine", "@tenfold/bot"],
  output: "standalone",
};

export default nextConfig;
