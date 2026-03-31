import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

function normalizeBase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "/";
  }
  if (trimmed === "./") {
    return "./";
  }
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export default defineConfig(() => {
  const envBase =
    process.env.TIGERPAW_CONTROL_UI_BASE_PATH?.trim() ||
    process.env.TIGERCLAW_CONTROL_UI_BASE_PATH?.trim() ||
    process.env.OPENCLAW_CONTROL_UI_BASE_PATH?.trim();
  const base = envBase ? normalizeBase(envBase) : "./";

  return {
    base,
    plugins: [react(), tailwindcss()],
    publicDir: path.resolve(here, "public"),
    resolve: {
      alias: {
        "@": path.resolve(here, "src"),
      },
    },
    build: {
      outDir: path.resolve(here, "../dist/control-ui"),
      emptyOutDir: true,
      sourcemap: true,
      chunkSizeWarningLimit: 1024,
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
    },
    test: {
      environment: "jsdom",
      include: ["src/**/__tests__/**/*.test.ts"],
    },
  };
});
