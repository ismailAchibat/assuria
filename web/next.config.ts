import type { NextConfig } from "next";

const MASTRA_URL = process.env.MASTRA_URL ?? "http://localhost:4111";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Proxy the chat to the Mastra server (avoids CORS, keeps the agent URL server-side).
  async rewrites() {
    return [{ source: "/api/chat", destination: `${MASTRA_URL}/chat/offer-advisor` }];
  },
};

export default nextConfig;
