import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local-only database engine; keep it out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
