import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const workspaceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: workspaceRoot,
  eslint: {
    // Root `pnpm lint` is the quality gate; Next in-build ESLint looks for a local config.
    ignoreDuringBuilds: true,
  },
  transpilePackages: [
    "@dentalcare/config",
    "@dentalcare/contracts",
    "@dentalcare/domain",
    "@dentalcare/application",
    "@dentalcare/db",
  ],
};

export default nextConfig;
