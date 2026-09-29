import assert from "node:assert/strict";
import { test } from "node:test";

type Pending = EventTarget & { text: string };

function installSpeechStubs(): { spoken: string[]; restore(): void } {
    const spoken: string[] = [];
    let pending: Pending | null = null;

    class FakeUtterance extends EventTarget {
        text: string;
        lang = "";
        voice: unknown = null;
        constructor(text: string) {
            super();
            this.text = text;
        }
    }

    const globals = globalThis as unknown as Record<string, unknown>;
    const had = { window: "window" in globals, synth: "speechSynthesis" in globals };

    globals.SpeechSynthesisUtterance = FakeUtterance;
    globals.window = globalThis;
    globals.speechSynthesis = {
        getVoices: () => [{ lang: "ja-JP", name: "Fake" }],
        addEventListener: () => {},
        pause: () => {},
        resume: () => {},
        cancel: () => {
            const utterance = pending;
            pending = null;
            if (utterance !== null) {
                const event = new Event("error");
                Object.defineProperty(event, "error", { value: "canceled" });
                utterance.dispatchEvent(event);
            }
        },
        speak: (utterance: Pending) => {
            spoken.push(utterance.text);
            pending = utterance;
            setTimeout(() => {
                if (pending === utterance) {
                    pending = null;
                    utterance.dispatchEvent(new Event("end"));
                }
            }, 0);
        },
    };

    return {
        spoken,
        restore() {
            if (!had.window) {
                delete globals.window;
            }
            if (!had.synth) {
                delete globals.speechSynthesis;
            }
            delete globals.SpeechSynthesisUtterance;
        },
    };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

test("reads a page and advances to the next", async () => {
    const stubs = installSpeechStubs();
    const { createSpeaker } = await import("../src/speech/speaker.ts");

    const pages: Record<number, string[]> = {
        1: ["いち。", "に。"],
        2: ["さん。"],
    };
    let page = 1;
    const notices: string[] = [];

    const speaker = createSpeaker({
        sentencesFor: (n) => Promise.resolve(pages[n] ?? []),
        nextPage: () => Promise.resolve(page < 2 ? ++page : null),
        onChange: () => {},
        onNotice: (text) => notices.push(text),
    });

    await speaker.start(1);
    await settle();

    assert.deepEqual(stubs.spoken, ["いち。", "に。", "さん。"]);
    assert.deepEqual(notices, []);
    assert.equal(speaker.speaking, false);

    speaker.stop();
    stubs.restore();
});

test("skips pages with nothing to read", async () => {
    const stubs = installSpeechStubs();
    const { createSpeaker } = await import("../src/speech/speaker.ts");

    const pages: Record<number, string[]> = { 1: [], 2: [], 3: ["よんだ。"] };
    let page = 1;

    const speaker = createSpeaker({
        sentencesFor: (n) => Promise.resolve(pages[n] ?? []),
        nextPage: () => Promise.resolve(page < 3 ? ++page : null),
        onChange: () => {},
        onNotice: () => {},
    });

    await speaker.start(1);
    await settle();

    assert.deepEqual(stubs.spoken, ["よんだ。"]);

    speaker.stop();
    stubs.restore();
});

test("stops and notices after five empty pages in a row", async () => {
    const stubs = installSpeechStubs();
    const { createSpeaker } = await import("../src/speech/speaker.ts");

    let page = 1;
    const notices: string[] = [];
    const visited: number[] = [];

    const speaker = createSpeaker({
        sentencesFor: (n) => {
            visited.push(n);
            return Promise.resolve([]);
        },
        nextPage: () => Promise.resolve(++page),
        onChange: () => {},
        onNotice: (text) => notices.push(text),
    });

    await speaker.start(1);
    await settle();

    assert.deepEqual(stubs.spoken, []);
    assert.equal(speaker.speaking, false);
    assert.deepEqual(notices, ["5ページ続けて読む本文が無かったので止めた。"]);
    assert.deepEqual(visited, [1, 2, 3, 4, 5]);

    speaker.stop();
    stubs.restore();
});

test("stops at the end of the document", async () => {
    const stubs = installSpeechStubs();
    const { createSpeaker } = await import("../src/speech/speaker.ts");

    const speaker = createSpeaker({
        sentencesFor: () => Promise.resolve(["おわり。"]),
        nextPage: () => Promise.resolve(null),
        onChange: () => {},
        onNotice: () => {},
    });

    await speaker.start(9);
    await settle();

    assert.deepEqual(stubs.spoken, ["おわり。"]);
    assert.equal(speaker.speaking, false);

    speaker.stop();
    stubs.restore();
});

test("reports when the browser has no voices", async () => {
    const stubs = installSpeechStubs();
    const { createSpeaker } = await import("../src/speech/speaker.ts");

    (
        globalThis as unknown as { speechSynthesis: { getVoices(): unknown[] } }
    ).speechSynthesis.getVoices = () => [];

    const notices: string[] = [];
    const speaker = createSpeaker({
        sentencesFor: () => Promise.resolve(["よむ。"]),
        nextPage: () => Promise.resolve(null),
        onChange: () => {},
        onNotice: (text) => notices.push(text),
    });

    await speaker.start(1);
    await settle();

    assert.deepEqual(stubs.spoken, []);
    assert.deepEqual(notices, ["このブラウザに読み上げ用の音声が入っていない。"]);
    assert.equal(speaker.speaking, false);

    stubs.restore();
});

test("stops and reports when the text cannot be read", async () => {
    const stubs = installSpeechStubs();
    const { createSpeaker } = await import("../src/speech/speaker.ts");

    const notices: string[] = [];
    const speaker = createSpeaker({
        sentencesFor: () => Promise.reject(new Error("壊れたページ")),
        nextPage: () => Promise.resolve(null),
        onChange: () => {},
        onNotice: (text) => notices.push(text),
    });

    speaker.toggle(1);
    await settle();

    assert.deepEqual(stubs.spoken, []);
    assert.deepEqual(notices, ["読み上げを続けられなかった: 壊れたページ"]);
    assert.equal(speaker.speaking, false);

    stubs.restore();
});

test("stops and reports when turning the page fails mid-reading", async () => {
    const stubs = installSpeechStubs();
    const { createSpeaker } = await import("../src/speech/speaker.ts");

    const notices: string[] = [];
    const speaker = createSpeaker({
        sentencesFor: () => Promise.resolve(["いち。"]),
        nextPage: () => Promise.reject(new Error("描画に失敗")),
        onChange: () => {},
        onNotice: (text) => notices.push(text),
    });

    speaker.toggle(1);
    await settle();

    assert.deepEqual(stubs.spoken, ["いち。"]);
    assert.deepEqual(notices, ["読み上げを続けられなかった: 描画に失敗"]);
    assert.equal(speaker.speaking, false);

    stubs.restore();
});
