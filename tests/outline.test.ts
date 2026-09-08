import assert from "node:assert/strict";
import { test } from "node:test";
import { flatten, loadOutline, nodeForPage, type OutlineSource } from "../src/pdf/outline.ts";

type FakeItem = {
    title: string;
    dest: unknown;
    items?: FakeItem[];
};

// getPageIndex は ref を受けるので、テストでは { num } を持つ偽 ref をページ番号-1 に写す
function fakeDoc(items: FakeItem[], named: Record<string, unknown> = {}): OutlineSource {
    return {
        getOutline: async () => items,
        getDestination: async (id: string) => {
            if (!(id in named)) {
                throw new Error(`unknown destination: ${id}`);
            }
            return named[id];
        },
        getPageIndex: async (ref: { num?: number }) => {
            if (typeof ref?.num !== "number") {
                throw new Error("not a ref");
            }
            return ref.num;
        },
    } as unknown as OutlineSource;
}

const ref = (num: number) => ({ num, gen: 0 });

test("keeps the tree shape and depth", async () => {
    const nodes = await loadOutline(
        fakeDoc([
            {
                title: "第1章",
                dest: [ref(0)],
                items: [
                    { title: "1.1 導入", dest: [ref(2)] },
                    {
                        title: "1.2 応用",
                        dest: [ref(5)],
                        items: [{ title: "1.2.1 詳細", dest: [ref(6)] }],
                    },
                ],
            },
            { title: "第2章", dest: [ref(20)] },
        ]),
    );

    assert.equal(nodes.length, 2);
    assert.equal(nodes[0].depth, 0);
    assert.equal(nodes[0].children.length, 2);
    assert.equal(nodes[0].children[1].depth, 1);
    assert.equal(nodes[0].children[1].children[0].depth, 2);
    assert.equal(nodes[0].children[1].children[0].title, "1.2.1 詳細");
    assert.deepEqual(
        flatten(nodes).map((node) => node.page),
        [1, 3, 6, 7, 21],
    );
});

test("resolves a dest given as an array", async () => {
    const nodes = await loadOutline(fakeDoc([{ title: "配列", dest: [ref(41)] }]));

    assert.equal(nodes[0].page, 42);
});

test("resolves a dest given as a named string", async () => {
    const nodes = await loadOutline(
        fakeDoc([{ title: "文字列", dest: "chapter-3" }], { "chapter-3": [ref(99)] }),
    );

    assert.equal(nodes[0].page, 100);
});

test("falls back to null when the dest cannot be resolved", async () => {
    const nodes = await loadOutline(
        fakeDoc([
            { title: "名前が引けない", dest: "missing" },
            { title: "dest が null", dest: null },
            { title: "空配列", dest: [] },
            { title: "ref ではない", dest: ["文字列"] },
        ]),
    );

    assert.deepEqual(
        nodes.map((node) => node.page),
        [null, null, null, null],
    );
});

test("an unresolvable parent keeps its resolvable children", async () => {
    const nodes = await loadOutline(
        fakeDoc([{ title: "親", dest: "missing", items: [{ title: "子", dest: [ref(9)] }] }]),
    );

    assert.equal(nodes[0].page, null);
    assert.equal(nodes[0].children[0].page, 10);
});

test("title is trimmed", async () => {
    const nodes = await loadOutline(fakeDoc([{ title: "  余白つき \n", dest: [ref(0)] }]));

    assert.equal(nodes[0].title, "余白つき");
});

test("an empty outline yields no nodes", async () => {
    assert.deepEqual(await loadOutline(fakeDoc([])), []);
});

test("nodeForPage picks the deepest node at or before the page", async () => {
    const nodes = await loadOutline(
        fakeDoc([
            {
                title: "第1章",
                dest: [ref(0)],
                items: [{ title: "1.1", dest: [ref(9)] }],
            },
            { title: "第2章", dest: [ref(29)] },
        ]),
    );

    assert.equal(nodeForPage(nodes, 1)?.title, "第1章");
    assert.equal(nodeForPage(nodes, 9)?.title, "第1章");
    assert.equal(nodeForPage(nodes, 10)?.title, "1.1");
    assert.equal(nodeForPage(nodes, 25)?.title, "1.1");
    assert.equal(nodeForPage(nodes, 30)?.title, "第2章");
    assert.equal(nodeForPage(nodes, 999)?.title, "第2章");
});

test("nodeForPage ignores nodes without a page", async () => {
    const nodes = await loadOutline(
        fakeDoc([
            { title: "ページなし", dest: "missing" },
            { title: "ページあり", dest: [ref(4)] },
        ]),
    );

    assert.equal(nodeForPage(nodes, 10)?.title, "ページあり");
    assert.equal(nodeForPage(nodes, 1), null);
});
