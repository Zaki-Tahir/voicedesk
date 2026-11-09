import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal server bundle for the Docker image.
  output: "standalone",
  // This is a monorepo: trace dependencies from the repo root, where node_modules lives.
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  poweredByHeader: false,
};

export default nextConfig;
