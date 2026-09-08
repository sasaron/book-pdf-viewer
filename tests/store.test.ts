import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../src/state/store.ts";

type Counter = { count: number; label: string };

const initial = (): Counter => ({ count: 0, label: "" });

test("set merges the patch and notifies", () => {
    const store = createStore(initial());
    const seen: Counter[] = [];
    store.subscribe((state) => seen.push({ ...state }));

    store.set({ count: 1 });

    assert.deepEqual(store.get(), { count: 1, label: "" });
    assert.deepEqual(seen, [{ count: 1, label: "" }]);
});

test("set does not notify when nothing changed", () => {
    const store = createStore(initial());
    let calls = 0;
    store.subscribe(() => {
        calls += 1;
    });

    store.set({ count: 0 });
    store.set({});

    assert.equal(calls, 0);
});

test("a partly changed patch still notifies once", () => {
    const store = createStore({ count: 5, label: "a" });
    let calls = 0;
    store.subscribe(() => {
        calls += 1;
    });

    store.set({ count: 5, label: "b" });

    assert.equal(calls, 1);
    assert.deepEqual(store.get(), { count: 5, label: "b" });
});

test("unsubscribe stops the listener", () => {
    const store = createStore(initial());
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
        calls += 1;
    });

    store.set({ count: 1 });
    unsubscribe();
    store.set({ count: 2 });

    assert.equal(calls, 1);
    assert.equal(store.get().count, 2);
});

test("every listener is notified", () => {
    const store = createStore(initial());
    const order: string[] = [];
    store.subscribe(() => order.push("first"));
    store.subscribe(() => order.push("second"));

    store.set({ count: 1 });

    assert.deepEqual(order, ["first", "second"]);
});

test("get returns the state after the change, not before", () => {
    const store = createStore(initial());
    let insideValue = -1;
    store.subscribe(() => {
        insideValue = store.get().count;
    });

    store.set({ count: 7 });

    assert.equal(insideValue, 7);
});
