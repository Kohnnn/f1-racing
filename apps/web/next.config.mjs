import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  transpilePackages: ["@f1-racing/schemas", "@f1-racing/telemetry-utils"],
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ["@f1-racing/telemetry-utils"],
  },
};

export default nextConfig;
