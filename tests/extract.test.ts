import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { TextContent } from "../src/pdf/pdf-types.ts";
import { pageSentences, readableLines } from "../src/speech/extract.ts";

type Fixture = {
    height: number;
    items: { str: string; fontName: string }[];
    styles: Record<string, { fontFamily: string }>;
};

const fixtures: Record<string, Fixture> = JSON.parse(
    readFileSync(new URL("./fixtures/textcontent.json", import.meta.url), "utf8"),
);

function page(number: string): { content: TextContent; height: number; raw: string } {
    const fixture = fixtures[number];
    return {
        content: { items: fixture.items, styles: fixture.styles, lang: null } as TextContent,
        height: fixture.height,
        raw: fixture.items.map((item) => item.str).join(""),
    };
}

function keptText(number: string): string {
    const { content, height } = page(number);
    return readableLines(content, height)
        .map((line) => line.text)
        .join("");
}

function monospaceText(number: string): string {
    const fixture = fixtures[number];
    const monoFonts = new Set(
        Object.entries(fixture.styles)
            .filter(([, style]) => style.fontFamily === "monospace")
            .map(([name]) => name),
    );
    return fixture.items
        .filter((item) => monoFonts.has(item.fontName))
        .map((item) => item.str)
        .join("");
}

test("drops the running head", () => {
    const { raw } = page("10");

    assert.ok(raw.includes("容量の見積もり"), "フィクスチャに柱が入っていること");
    assert.ok(!keptText("10").includes("容量の見積もり"));
});

test("drops the page number at the foot", () => {
    const { content, height } = page("10");

    assert.ok(
        fixtures["10"].items.some((item) => item.str.trim() === "10"),
        "フィクスチャにノンブルが入っていること",
    );

    const lines = readableLines(content, height).map((line) => line.text.trim());
    assert.deepEqual(
        lines.filter((text) => /^\d{1,3}$/.test(text)),
        [],
    );
    // 地の紙面に置かれた同じ行の柱も、下端にあるという理由だけで落ちる
    assert.ok(!keptText("10").includes("第 3 章"));
});

test("folds a page that is mostly code", () => {
    const mono = monospaceText("11");

    assert.ok(mono.length > 500, "フィクスチャに十分なコードが入っていること");
    assert.ok(mono.startsWith("struct Ring"));
    assert.ok(!keptText("11").includes(mono.slice(0, 20)));
});

test("keeps prose that sits next to code", () => {
    assert.deepEqual(pageSentences(page("11").content, fixtures["11"].height), [
        "確保し直す実装を示す。",
        "押し込みは償却で一定、取り出しは最悪でも一定である。",
    ]);
});

test("splits sentences at Japanese full stops", () => {
    const sentences = pageSentences(page("12").content, fixtures["12"].height);

    assert.equal(sentences.length, 7);
    assert.ok(sentences.includes("●書き込み位置：次に置く場所を指す。"));
});

test("splits a sentence whose comma sits exactly on the limit", () => {
    const sentences = pageSentences(page("13").content, fixtures["13"].height);

    assert.deepEqual(
        sentences.map((sentence) => sentence.length),
        [51, 58],
    );
});

test("every sentence carries Japanese or is long enough to be prose", () => {
    for (const number of ["10", "11", "12", "13"]) {
        for (const sentence of pageSentences(page(number).content, fixtures[number].height)) {
            assert.ok(
                /[ぁ-んァ-ヶー一-龠々〆]/.test(sentence) || sentence.length >= 20,
                `page ${number}: ${sentence}`,
            );
        }
    }
});

test("no chunk exceeds the utterance limit", () => {
    for (const number of ["10", "11", "12", "13"]) {
        for (const sentence of pageSentences(page(number).content, fixtures[number].height)) {
            assert.ok(sentence.length <= 90, `page ${number}: ${sentence.length} 文字`);
        }
    }
});
