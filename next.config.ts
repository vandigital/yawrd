import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node 26 does not return captured output from Next 16.4's detached CLI
  // checker. The in-process checker uses the same installed TypeScript API.
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
