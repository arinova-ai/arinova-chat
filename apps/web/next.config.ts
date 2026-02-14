import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@arinova/shared"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
