/**
 * extract.test.ts のフィクスチャを作る。
 *
 *   deno run -A scripts/dump-textcontent.mjs <pdf> <page>... > tests/fixtures/<name>.json
 *
 * legacy build を使うのは、Node/Deno 側に DOM が無いため。
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfjsRoot = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

const [file, ...pages] = process.argv.slice(2);

if (file === undefined || pages.length === 0) {
    console.error("usage: dump-textcontent.mjs <pdf> <page>...");
    process.exit(1);
}

const doc = await getDocument({
    data: new Uint8Array(await Deno.readFile(file)),
    cMapUrl: `${join(pdfjsRoot, "cmaps")}/`,
    cMapPacked: true,
    standardFontDataUrl: `${join(pdfjsRoot, "standard_fonts")}/`,
    useSystemFonts: true,
    verbosity: 0,
}).promise;

const out = {};

for (const raw of pages) {
    const number = Number(raw);
    const page = await doc.getPage(number);
    const content = await page.getTextContent();

    out[number] = {
        height: page.getViewport({ scale: 1 }).height,
        items: content.items.map((item) => ({
            str: item.str,
            transform: item.transform,
            width: item.width,
            height: item.height,
            fontName: item.fontName,
        })),
        styles: Object.fromEntries(
            Object.entries(content.styles).map(([name, style]) => [
                name,
                { fontFamily: style.fontFamily },
            ]),
        ),
    };
}

console.log(JSON.stringify(out, null, 2));
