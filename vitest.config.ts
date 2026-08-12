import { defineConfig } from "vitest/config";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ESM 下无 __dirname，由 import.meta.url 推导（vitest.config 属 type:module）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "node",
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
});
