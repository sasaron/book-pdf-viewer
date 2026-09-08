import { isPdf, openFile } from "./pdf/loader.ts";
import { loadOutline, nodeForPage } from "./pdf/outline.ts";
import { clampScale, createRenderer, SCALE_STEP } from "./pdf/renderer.ts";
import { sentencesForPage } from "./pdf/text.ts";
import { createSpeaker } from "./speech/speaker.ts";
import { createStore } from "./state/store.ts";
import type { Bookmark, OpenDocument, OutlineNode, ViewerState } from "./state/types.ts";
import {
    type BookmarkEntry,
    type BookmarkStore,
    hasMark,
    loadStore,
    saveStore,
    toggleMark,
} from "./storage/bookmarks.ts";
import { loadPrefs, savePrefs } from "./storage/prefs.ts";
import { createBookmarksView } from "./ui/bookmarks-view.ts";
import { required } from "./ui/dom.ts";
import { createDropzone } from "./ui/dropzone.ts";
import { createKeyboard } from "./ui/keyboard.ts";
import { createOutlineView } from "./ui/outline-view.ts";
import { createStatusbar } from "./ui/statusbar.ts";
import { createToolbar } from "./ui/toolbar.ts";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/textlayer.css";

const LAST_PAGE_FLUSH_MS = 500;

const viewer = required<HTMLElement>("#viewer");
const fileInput = required<HTMLInputElement>("#file");
const statusbar = createStatusbar(required<HTMLElement>("#statusbar"));
const renderer = createRenderer(viewer);

const prefs = loadPrefs();
const bookmarks: BookmarkStore = loadStore();

const store = createStore<ViewerState>({
    docId: null,
    name: "",
    page: 1,
    numPages: 0,
    scale: 1,
    fit: true,
    bookmarked: false,
    speaking: false,
    sidebarCollapsed: prefs.sidebarCollapsed,
});

const speaker = createSpeaker({
    sentencesFor: (page) =>
        active === null ? Promise.resolve([]) : sentencesForPage(active.doc, page),

    nextPage: async () => {
        if (active === null || active.view.page >= active.numPages) {
            return null;
        }
        await draw(active.view.page + 1);
        return active.view.page;
    },

    onChange: (speaking) => store.set({ speaking }),
    onNotice: (text) => statusbar.error(text),
});

let active: OpenDocument | null = null;
let outline: OutlineNode[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function entryFor(opened: OpenDocument): BookmarkEntry {
    const existing = bookmarks[opened.id];
    if (existing !== undefined) {
        return existing;
    }
    const created: BookmarkEntry = {
        name: opened.name,
        updatedAt: Date.now(),
        lastPage: 1,
        marks: [],
    };
    bookmarks[opened.id] = created;
    return created;
}

function currentMarks(): readonly Bookmark[] {
    return active === null ? [] : entryFor(active).marks;
}

// 連打で毎回 localStorage を書くと同期I/Oが積み上がる
function flushLater(): void {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => saveStore(bookmarks), LAST_PAGE_FLUSH_MS);
}

function persistNow(): void {
    clearTimeout(flushTimer);
    saveStore(bookmarks);
}

const bookmarksView = createBookmarksView(
    required<HTMLElement>("#bookmarks"),
    required<HTMLElement>("#bookmarks-head"),
    {
        onJump: (page) => void draw(page),
        onRemove: (page) => {
            if (active === null) {
                return;
            }
            const entry = entryFor(active);
            entry.marks = entry.marks.filter((mark) => mark.page !== page);
            entry.updatedAt = Date.now();
            persistNow();
            syncBookmarks();
        },
    },
);

const outlineView = createOutlineView(required<HTMLElement>("#outline"), {
    onJump: (page) => void draw(page),
});

function labelForPage(page: number): string {
    return nodeForPage(outline, page)?.title ?? "";
}

function syncBookmarks(): void {
    const marks = currentMarks();
    bookmarksView.render(marks);
    store.set({ bookmarked: hasMark(marks, store.get().page) });
}

async function draw(pageNumber: number): Promise<void> {
    if (active === null) {
        return;
    }

    // 自動送りと、同じページの描き直しでは止めない
    const target = Math.min(Math.max(pageNumber, 1), active.numPages);
    if (target !== active.view.page && !speaker.advancing) {
        speaker.stop();
    }

    try {
        await renderer.render(active, pageNumber);
        const page = active.view.page;
        const entry = entryFor(active);
        entry.lastPage = page;
        entry.updatedAt = Date.now();
        flushLater();
        outlineView.highlight(page);
        store.set({
            page,
            scale: active.view.scale,
            fit: active.view.fit,
            bookmarked: hasMark(entry.marks, page),
        });
    } catch (error) {
        statusbar.error(`描画できませんでした: ${message(error)}`);
    }
}

const actions = {
    onOpen: () => fileInput.click(),

    onGoto: (page: number) => void draw(page),

    onStep: (delta: number) => void draw((active?.view.page ?? 1) + delta),

    onZoom: (direction: number) => {
        if (active === null) {
            return;
        }
        active.view.fit = false;
        active.view.scale = clampScale(active.view.scale + direction * SCALE_STEP);
        void draw(active.view.page);
    },

    onFit: () => {
        if (active === null) {
            return;
        }
        active.view.fit = true;
        void draw(active.view.page);
    },

    onToggleBookmark: () => {
        if (active === null) {
            return;
        }
        const entry = entryFor(active);
        entry.marks = toggleMark(entry.marks, active.view.page, labelForPage(active.view.page));
        entry.updatedAt = Date.now();
        persistNow();
        syncBookmarks();
    },

    onToggleSpeech: () => {
        if (active !== null) {
            speaker.toggle(active.view.page);
        }
    },

    onToggleSidebar: () => {
        const sidebarCollapsed = !store.get().sidebarCollapsed;
        store.set({ sidebarCollapsed });
        savePrefs({ sidebarCollapsed });
    },

    onEscape: () => {
        speaker.stop();
        statusbar.clear();
    },
};

const toolbar = createToolbar(actions);
createKeyboard(actions);

store.subscribe((state) => {
    document.body.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
    toolbar.update(state);
});

async function open(files: File[]): Promise<void> {
    const pdfs = files.filter(isPdf);
    if (pdfs.length === 0) {
        statusbar.error("PDF ではありません");
        return;
    }

    const file = pdfs[pdfs.length - 1];
    statusbar.info(`${file.name} を読み込み中…`);
    speaker.stop();

    try {
        const started = performance.now();
        outline = [];
        outlineView.clear();
        active = await openFile(file);

        const entry = entryFor(active);
        entry.name = active.name;
        const resume = Math.min(Math.max(entry.lastPage, 1), active.numPages);

        store.set({
            docId: active.id,
            name: active.name,
            numPages: active.numPages,
            page: resume,
            fit: active.view.fit,
        });

        await draw(resume);
        syncBookmarks();

        const resumed = resume > 1 ? ` / ${resume} ページから` : "";
        statusbar.info(
            `${active.numPages} ページ / ${Math.round(performance.now() - started)}ms${resumed}`,
        );

        // 目次より1ページ目の描画を先に出す
        const opened = active;
        outline = await loadOutline(opened.doc);
        if (active === opened) {
            outlineView.render(outline);
            outlineView.highlight(opened.view.page);
        }
    } catch (error) {
        active = null;
        outline = [];
        outlineView.clear();
        store.set({ docId: null, name: "", numPages: 0, bookmarked: false });
        bookmarksView.render([]);
        statusbar.error(`開けませんでした: ${message(error)}`);
    }
}

createDropzone(document.body, { onFiles: (files) => void open(files) });

fileInput.addEventListener("change", () => {
    void open(Array.from(fileInput.files ?? []));
    fileInput.value = "";
});

renderer.watchResize(() => {
    if (active?.view.fit) {
        void draw(active.view.page);
    }
});

// タブを閉じるときに debounce 待ちの lastPage が消えると「続きから」がずれる
globalThis.addEventListener("pagehide", persistNow);

document.body.classList.toggle("sidebar-collapsed", prefs.sidebarCollapsed);
toolbar.update(store.get());
bookmarksView.render([]);
