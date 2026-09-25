import { defineConfig } from "@playwright/test";

const port = process.env.PORT || "3000";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "pnpm dev",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
