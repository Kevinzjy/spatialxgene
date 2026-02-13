import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base: one build works at / or any subpath (e.g. /spatialxgene/) without recompile
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:5005", changeOrigin: true },
    },
  },
});
