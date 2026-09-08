import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
    addMark,
    BOOKMARKS_KEY,
    type BookmarkStore,
    hasMark,
    loadStore,
    parseStore,
    removeMark,
    saveStore,
    toggleMark,
} from "../src/storage/bookmarks.ts";

beforeEach(() => {
    localStorage.removeItem(BOOKMARKS_KEY);
});

test("addMark keeps pages sorted", () => {
    let marks = addMark([], 30, "第3章");
    marks = addMark(marks, 10, "第1章");
    marks = addMark(marks, 20, "第2章");

    assert.deepEqual(
        marks.map((mark) => mark.page),
        [10, 20, 30],
    );
});

test("addMark ignores a page that is already marked", () => {
    const marks = addMark(addMark([], 10, "初回"), 10, "二回目");

    assert.equal(marks.length, 1);
    assert.equal(marks[0].label, "初回");
});

test("removeMark drops only the named page", () => {
    const marks = removeMark(addMark(addMark([], 10), 20), 10);

    assert.deepEqual(
        marks.map((mark) => mark.page),
        [20],
    );
});

test("toggleMark adds then removes", () => {
    const added = toggleMark([], 42);
    assert.ok(hasMark(added, 42));

    const removed = toggleMark(added, 42);
    assert.equal(removed.length, 0);
});

test("addMark does not mutate the input", () => {
    const original = addMark([], 10);
    addMark(original, 20);
    removeMark(original, 10);

    assert.deepEqual(
        original.map((mark) => mark.page),
        [10],
    );
});

test("store round-trips through localStorage", () => {
    const store: BookmarkStore = {
        abc123: {
            name: "ring-buffer.pdf",
            updatedAt: 1_700_000_000_000,
            lastPage: 120,
            marks: [{ page: 12, label: "容量の見積もり" }],
        },
    };

    saveStore(store);

    assert.deepEqual(loadStore(), store);
});

test("different docIds stay separate", () => {
    saveStore({
        abc: { name: "a.pdf", updatedAt: 1, lastPage: 5, marks: [{ page: 5, label: "" }] },
        def: { name: "b.pdf", updatedAt: 2, lastPage: 9, marks: [{ page: 9, label: "" }] },
    });

    const loaded = loadStore();

    assert.equal(loaded.abc.lastPage, 5);
    assert.equal(loaded.def.lastPage, 9);
    assert.deepEqual(loaded.abc.marks, [{ page: 5, label: "" }]);
});

test("parseStore recovers from broken JSON", () => {
    assert.deepEqual(parseStore("{not json"), {});
    assert.deepEqual(parseStore("null"), {});
    assert.deepEqual(parseStore("[1,2,3]"), {});
    assert.deepEqual(parseStore(null), {});
});

test("loadStore recovers from a broken value already in localStorage", () => {
    localStorage.setItem(BOOKMARKS_KEY, "{ truncated");

    assert.deepEqual(loadStore(), {});
});

test("parseStore drops malformed marks and fills missing fields", () => {
    const parsed = parseStore(
        JSON.stringify({
            abc: {
                marks: [
                    { page: 30, label: "後" },
                    { page: "10" },
                    null,
                    { label: "ページ番号なし" },
                    { page: 0 },
                    { page: 10 },
                ],
            },
        }),
    );

    assert.deepEqual(parsed.abc, {
        name: "",
        updatedAt: 0,
        lastPage: 1,
        marks: [
            { page: 10, label: "" },
            { page: 30, label: "後" },
        ],
    });
});
