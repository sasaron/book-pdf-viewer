import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const pdfjsRoot = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

const PDFJS_ASSET_DIRS = ["cmaps", "standard_fonts", "wasm", "iccs"];

export default defineConfig({
    base: "./",
    plugins: [
        viteStaticCopy({
            targets: PDFJS_ASSET_DIRS.map((dir) => ({
                src: `${join(pdfjsRoot, dir)}/*`,
                dest: dir,
                rename: { stripBase: true },
            })),
        }),
    ],
});
