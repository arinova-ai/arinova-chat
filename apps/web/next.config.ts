import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@arinova/shared"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uploads.chat.arinova.ai",
      },
      {
        protocol: "https",
        hostname: "**.arinova.ai",
      },
    ],
  },
};

export default nextConfig;
