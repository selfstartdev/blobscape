import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Match tsconfig paths: src/react imports the core as "blobscape".
  resolve: { alias: [{ find: /^blobscape$/, replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)) }] },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
