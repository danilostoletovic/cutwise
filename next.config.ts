import type { NextConfig } from "next";
const pages = process.env.CUTWISE_STATIC_EXPORT === "1";
const basePath = process.env.CUTWISE_BASE_PATH ?? "";

const config: NextConfig = pages
  ? {
      output: "export",
      basePath,
      trailingSlash: true,
      env: { NEXT_PUBLIC_CUTWISE_BASE_PATH: basePath },
    }
  : {
      pageExtensions: ["server.ts", "tsx", "ts", "jsx", "js"],
      async headers() {
        return [
          {
            source: "/:path*",
            headers: [
              { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
              { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
              { key: "X-Content-Type-Options", value: "nosniff" },
            ],
          },
        ];
      },
    };
export default config;
