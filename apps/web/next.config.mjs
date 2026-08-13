import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const releaseDistDir = process.env.F1_NEXT_DIST_DIR;
const releaseBuildId = process.env.F1_RELEASE_BUILD_ID;

const nextConfig = {
  ...(releaseDistDir ? { distDir: releaseDistDir } : {}),
  ...(releaseBuildId ? { generateBuildId: async () => releaseBuildId } : {}),
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
