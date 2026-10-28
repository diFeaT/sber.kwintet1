import { defineConfig } from "vite";
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/* Сайт — статический (HTML/CSS/vanilla JS + Three.js из vendor/), как и на GitHub Pages.
   Скрипты config.js и vendor/*.js подключены обычными <script>, поэтому Vite не включает их в сборку сам:
   плагин копирует их в dist, чтобы собранная версия работала так же, как исходные файлы. */
const base = process.env.VITE_BASE || "/";
const hmrClientPort = Number(process.env.VITE_HMR_CLIENT_PORT || 5173);

const copyStatic = () => ({
  name: "copy-static-scripts",
  apply: "build" as const,
  closeBundle() {
    for (const p of ["config.js", "vendor"]) {
      if (existsSync(resolve(p))) cpSync(resolve(p), resolve("dist", p), { recursive: true });
    }
  },
});

export default defineConfig({
  base,
  plugins: [copyStatic()],
  build: { target: "es2020" },
  server: {
    host: "0.0.0.0",
    port: 5173,
    hmr: hmrClientPort === 5173 ? undefined : { clientPort: hmrClientPort },
    allowedHosts: true,
  },
});
