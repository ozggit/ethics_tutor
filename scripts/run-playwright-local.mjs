import { spawnSync } from "node:child_process";

process.env.PLAYWRIGHT_BASE_URL ||= "http://localhost:3000";
process.env.E2E_LOCAL ||= "1";

const result = spawnSync("npx", ["playwright", "test"], {
  stdio: "inherit",
  shell: true,
  env: process.env
});

process.exit(result.status ?? 1);
