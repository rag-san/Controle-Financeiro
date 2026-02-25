import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/@napi-rs/canvas/index.js",
      "./node_modules/@napi-rs/canvas/js-binding.js",
      "./node_modules/@napi-rs/canvas/package.json",
      "./node_modules/@napi-rs/canvas-win32-x64-msvc/**/*",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "./node_modules/@napi-rs/canvas-linux-x64-musl/**/*"
    ]
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"]
  }
};

export default nextConfig;
