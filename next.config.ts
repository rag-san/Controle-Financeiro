import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  reactStrictMode: false,
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingRoot: projectRoot,
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0, must-revalidate"
          }
        ]
      }
    ];
  },
  turbopack: {
    root: projectRoot
  },
  ...(isProduction
    ? {
        outputFileTracingIncludes: {
          "/*": [
            "./node_modules/pdf-parse/**/*",
            "./node_modules/pdfjs-dist/**/*",
            "./node_modules/@napi-rs/canvas/**/*",
            "./node_modules/@napi-rs/canvas-*/**/*"
          ]
        }
      }
    : {}),
  webpack: (config, { dev }) => {
    if (dev) {
      const escapedRoot = projectRoot.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&").replace(/\\\\/g, "\\\\");
      const watchIgnoredPattern = new RegExp(
        `^(?!${escapedRoot}).*|^[A-Za-z]:\\\\(?:pagefile\\.sys|swapfile\\.sys|hiberfil\\.sys|DumpStack\\.log\\.tmp|System Volume Information)(?:\\\\|$)`,
        "i"
      );

      config.watchOptions = {
        ...(config.watchOptions ?? {}),
        ignored: watchIgnoredPattern,
        poll: 1000
      };
    }

    return config;
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"]
  }
};

export default nextConfig;
