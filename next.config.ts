import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "apify-client",
    // Phase 17.5: Browserbase CDP nav. Without these, Turbopack bundles
    // playwright-core/BB SDK into the server bundle and the CDP WebSocket
    // handshake fails ("Target page, context or browser has been closed")
    // even though the same code in a standalone .mjs script works fine.
    "playwright-core",
    "@browserbasehq/sdk",
    "@browserbasehq/stagehand",
    "ws",
  ],
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
    automaticVercelMonitors: true,
  },
});
