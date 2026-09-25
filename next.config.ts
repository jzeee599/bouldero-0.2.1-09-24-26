import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright opens the local development server through this loopback host.
  // Production deployments are unaffected by this development-only allowlist.
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
};

export default nextConfig;
