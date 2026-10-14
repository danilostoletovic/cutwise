import { defineConfig } from "@playwright/test";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true);
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/global-setup.ts",
  timeout: 180000,
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL || "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 1000 },
    headless: true,
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
