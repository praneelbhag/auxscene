import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The demo is a client-only Vite site. There is deliberately no /api proxy.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
});
