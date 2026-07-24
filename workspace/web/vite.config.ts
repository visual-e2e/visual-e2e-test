import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function bundleSizeBudget(): Plugin {
  const maxEntryGzipKiB = Number(process.env.WEB_MAX_ENTRY_GZIP_KIB ?? 300);
  const maxTotalGzipKiB = Number(process.env.WEB_MAX_TOTAL_GZIP_KIB ?? 700);

  return {
    name: "bundle-size-budget",
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((output) => output.type === "chunk");
      const gzipSizes = chunks.map((chunk) => ({
        fileName: chunk.fileName,
        isEntry: chunk.isEntry,
        bytes: gzipSync(chunk.code).byteLength,
      }));
      const entry = gzipSizes.find((chunk) => chunk.isEntry);
      const totalGzipKiB = gzipSizes.reduce((total, chunk) => total + chunk.bytes, 0) / 1024;
      const entryGzipKiB = (entry?.bytes ?? 0) / 1024;

      this.info(
        `Web JS gzip: entry ${entryGzipKiB.toFixed(1)} KiB, total ${totalGzipKiB.toFixed(1)} KiB`,
      );
      if (entryGzipKiB > maxEntryGzipKiB) {
        this.error(
          `Web entry exceeds gzip budget: ${entryGzipKiB.toFixed(1)} KiB > ${maxEntryGzipKiB} KiB`,
        );
      }
      if (totalGzipKiB > maxTotalGzipKiB) {
        this.error(
          `Web JS exceeds total gzip budget: ${totalGzipKiB.toFixed(1)} KiB > ${maxTotalGzipKiB} KiB`,
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), bundleSizeBudget()],
  resolve: {
    alias: {
      "@vet/rpc": path.join(repoRoot, "rpc"),
    },
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL ?? "http://localhost:3101",
        changeOrigin: true,
      },
    },
  },
});
