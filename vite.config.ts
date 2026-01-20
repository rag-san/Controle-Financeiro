import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/Controle-Financeiro/",
  server: {
    proxy: {
      "/suggest-category": "http://localhost:3001",
      "/api": "http://localhost:3001",
    },
  },
});
