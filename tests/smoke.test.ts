import assert from "node:assert/strict";
import { test } from "node:test";

test("localStorage is available under --location", () => {
    localStorage.setItem("pdfviewer:smoke", "ok");
    assert.equal(localStorage.getItem("pdfviewer:smoke"), "ok");
    localStorage.removeItem("pdfviewer:smoke");
});
