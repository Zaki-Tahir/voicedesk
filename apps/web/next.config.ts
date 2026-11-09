import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal server bundle for the Docker image.
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
