import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages のサブパス配信用 (CI が BASE_PATH=/KaoKakushi/ を注入)
  base: process.env.BASE_PATH ?? "/",
  build: {
    target: "es2022",
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
