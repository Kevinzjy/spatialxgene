import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;
const BASE_URL = `http://127.0.0.1:${PORT}/`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "pixi run -v npx vite --host 127.0.0.1 --port 5173",
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      cwd: ".",
      timeout: 120 * 1000,
    },
    {
      command: "pixi run -v spatialxgene launch --data-dir ../../tests/h5ad --port 5005",
      port: 5005,
      reuseExistingServer: !process.env.CI,
      cwd: "..",
      timeout: 120 * 1000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

