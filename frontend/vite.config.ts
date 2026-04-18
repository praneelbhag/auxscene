import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const rootEnvDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootEnvDir, "");
  const apiBaseUrl = env.VITE_API_BASE_URL ?? "http://localhost:8000";

  return {
    envDir: rootEnvDir,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": apiBaseUrl,
      },
    },
  };
});
