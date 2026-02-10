import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
  // COOP/COEP headers intentionally omitted - they block blob: URLs in <video>
  // and break local file loading. Server-side FFmpeg doesn't need them.
};

export default nextConfig;
