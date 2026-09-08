import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { loadPrefs, savePrefs } from "../src/storage/prefs.ts";

const KEY = "pdfviewer:ui";

beforeEach(() => {
    localStorage.removeItem(KEY);
});

test("defaults to an open sidebar", () => {
    assert.deepEqual(loadPrefs(), { sidebarCollapsed: false });
});

test("round-trips through localStorage", () => {
    savePrefs({ sidebarCollapsed: true });

    assert.deepEqual(loadPrefs(), { sidebarCollapsed: true });
});

test("recovers from a broken value", () => {
    for (const broken of ["{ truncated", "null", "[]", '"string"', "42"]) {
        localStorage.setItem(KEY, broken);
        assert.deepEqual(loadPrefs(), { sidebarCollapsed: false }, broken);
    }
});

test("treats a non-boolean as collapsed=false", () => {
    localStorage.setItem(KEY, JSON.stringify({ sidebarCollapsed: "yes" }));

    assert.deepEqual(loadPrefs(), { sidebarCollapsed: false });
});

test("ignores unknown keys", () => {
    localStorage.setItem(KEY, JSON.stringify({ sidebarCollapsed: true, theme: "dark" }));

    assert.deepEqual(loadPrefs(), { sidebarCollapsed: true });
});
