import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { defineConfig, type Plugin, transformWithOxc } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const pdfjsRoot = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

const PDFJS_ASSET_DIRS = ["cmaps", "standard_fonts", "wasm", "iccs"];

const SERVICE_WORKER_SOURCE = "src/sw.ts";
const SERVICE_WORKER_OUTPUT = "sw.js";

// sw.js は URL を固定する。ハッシュ付きの名前にすると、キャッシュ済みの古い index.html が
// 古い URL を登録し続けて更新に気づけない。
// プリキャッシュの一覧は bundle ではなく dist を読む。static-copy の写しは bundle に載らない
function serviceWorker(): Plugin {
    let root = "";
    let outDir = "";
    return {
        name: "service-worker",
        apply: "build",
        configResolved(config) {
            root = config.root;
            outDir = resolve(config.root, config.build.outDir);
        },
        async closeBundle() {
            const files = (await readdir(outDir, { recursive: true, withFileTypes: true }))
                .filter((entry) => entry.isFile())
                .map((entry) => relative(outDir, join(entry.parentPath, entry.name)))
                .map((path) => path.split(sep).join("/"))
                .filter((path) => path !== SERVICE_WORKER_OUTPUT)
                .sort();

            const source = await readFile(resolve(root, SERVICE_WORKER_SOURCE), "utf8");
            const { code } = await transformWithOxc(source, SERVICE_WORKER_SOURCE);

            // sw.ts だけを変えた版でもキャッシュ名を変える。同じ名前だと、新しい版の install が
            // 動いている古い版のキャッシュを上書きする
            const hash = createHash("sha256").update(code);
            for (const path of files) {
                hash.update(path);
                hash.update(await readFile(join(outDir, path)));
            }

            await writeFile(
                join(outDir, SERVICE_WORKER_OUTPUT),
                inject(code, {
                    __PRECACHE__: JSON.stringify(files),
                    __VERSION__: JSON.stringify(hash.digest("hex").slice(0, 16)),
                }),
            );
        },
    };
}

function inject(code: string, values: Record<string, string>): string {
    let result = code;
    for (const [name, value] of Object.entries(values)) {
        if (!result.includes(name)) {
            throw new Error(`${SERVICE_WORKER_SOURCE} に ${name} が見つからない`);
        }
        result = result.replaceAll(name, value);
    }
    return result;
}

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
        serviceWorker(),
    ],
});
