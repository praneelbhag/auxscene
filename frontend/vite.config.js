import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
var rootEnvDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export default defineConfig(function (_a) {
    var _b;
    var mode = _a.mode;
    var env = loadEnv(mode, rootEnvDir, "");
    var apiBaseUrl = (_b = env.VITE_API_BASE_URL) !== null && _b !== void 0 ? _b : "http://localhost:8000";
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
