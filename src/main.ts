import { closeDocument, isPdf, openDocuments, openFile } from "./pdf/loader.ts";
import { loadOutline, nodeForPage } from "./pdf/outline.ts";
import { clampScale, createRenderer, SCALE_STEP } from "./pdf/renderer.ts";
import { sentencesForPage } from "./pdf/text.ts";
import { registerServiceWorker } from "./pwa.ts";
import { createSpeaker } from "./speech/speaker.ts";
import { createStore } from "./state/store.ts";
import type { Bookmark, DocId, OpenDocument, ViewerState } from "./state/types.ts";
import {
    type BookmarkEntry,
    type BookmarkStore,
    hasMark,
    loadStore,
    saveStore,
    toggleMark,
} from "./storage/bookmarks.ts";
import * as library from "./storage/library.ts";
import { loadPrefs, savePrefs } from "./storage/prefs.ts";
import { createBookmarksView } from "./ui/bookmarks-view.ts";
import { createDocTabs } from "./ui/doctabs.ts";
import { required } from "./ui/dom.ts";
import { createDropzone } from "./ui/dropzone.ts";
import { createKeyboard } from "./ui/keyboard.ts";
import { createLibraryView } from "./ui/library-view.ts";
import { createOutlineView } from "./ui/outline-view.ts";
import { createStatusbar } from "./ui/statusbar.ts";
import { createToolbar } from "./ui/toolbar.ts";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/textlayer.css";

const LAST_PAGE_FLUSH_MS = 500;

const EMPTY_MESSAGE =
    "PDF をドラッグ&ドロップするか、「開く」から選んでください。\n" +
    "複数まとめて落とすとタブで行き来できます。\n\n" +
    "←  →  ページ送り\n" +
    "+  -  拡大縮小\n" +
    "b     しおり\n" +
    "r     読み上げ\n" +
    "[     サイドバー";

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

const docTabs = createDocTabs(required<HTMLElement>("#doctabs"), {
    onSelect: (id) => void select(id),
    onClose: (id) => void closeTab(id),
});

function labelForPage(page: number): string {
    return nodeForPage(active?.outline ?? [], page)?.title ?? "";
}

function syncBookmarks(): void {
    const marks = currentMarks();
    bookmarksView.render(marks);
    store.set({ bookmarked: hasMark(marks, store.get().page) });
}

function syncTabs(): void {
    docTabs.render(openDocuments(), active?.id ?? null);
}

const emptyPane = document.createElement("div");
emptyPane.className = "empty-pane";

const guide = document.createElement("p");
guide.className = "empty";
guide.textContent = EMPTY_MESSAGE;

const libraryPane = document.createElement("div");
libraryPane.className = "library";
libraryPane.hidden = true;

emptyPane.append(guide, libraryPane);

const libraryView = createLibraryView(libraryPane, {
    onOpen: (id) => void openFromLibrary(id),
    onRemove: (id) => void forget(id),
});

function showEmptyState(): void {
    viewer.replaceChildren(emptyPane);
}

async function refreshLibrary(): Promise<void> {
    const [entries, used] = await Promise.all([library.list(), library.usage()]);
    libraryView.render(entries, used);
}

async function openFromLibrary(id: DocId): Promise<void> {
    const file = await library.read(id);
    if (file === null) {
        // ブラウザが退避したあと。しおりは localStorage 側に残っている
        statusbar.error("この端末から消えていました。D&D で開き直してください。");
        await refreshLibrary();
        return;
    }
    await open([file]);
}

async function forget(id: DocId): Promise<void> {
    await library.remove(id);
    await refreshLibrary();
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

/** 目次より本文を先に出す。読み終えるまでにタブが変わっていたら捨てる。 */
async function ensureOutline(opened: OpenDocument): Promise<void> {
    if (opened.outline === null) {
        opened.outline = await loadOutline(opened.doc);
    }
    if (active === opened) {
        outlineView.render(opened.outline);
        outlineView.highlight(opened.view.page);
    }
}

async function activate(opened: OpenDocument): Promise<void> {
    speaker.stop();
    active = opened;
    outlineView.clear();

    const entry = entryFor(opened);
    entry.name = opened.name;

    store.set({
        docId: opened.id,
        name: opened.name,
        numPages: opened.numPages,
        page: opened.view.page,
        scale: opened.view.scale,
        fit: opened.view.fit,
    });

    syncTabs();
    await draw(opened.view.page);
    syncBookmarks();
    await ensureOutline(opened);
}

async function select(id: DocId): Promise<void> {
    const opened = openDocuments().find((candidate) => candidate.id === id);
    if (opened === undefined || opened === active) {
        return;
    }
    await activate(opened);
    statusbar.info(`${opened.name} / ${opened.numPages} ページ`);
}

async function closeTab(id: DocId): Promise<void> {
    const wasActive = active?.id === id;
    if (wasActive) {
        speaker.stop();
        active = null;
    }

    persistNow();
    await closeDocument(id);

    const rest = openDocuments();
    if (!wasActive) {
        syncTabs();
        return;
    }

    if (rest.length === 0) {
        outlineView.clear();
        bookmarksView.render([]);
        showEmptyState();
        store.set({ docId: null, name: "", numPages: 0, page: 1, bookmarked: false });
        syncTabs();
        statusbar.clear();
        void refreshLibrary();
        return;
    }

    await activate(rest[rest.length - 1]);
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

    speaker.stop();
    statusbar.info(
        pdfs.length === 1 ? `${pdfs[0].name} を読み込み中…` : `${pdfs.length} 冊を読み込み中…`,
    );

    const started = performance.now();
    const alreadyOpen = new Set(openDocuments().map((doc) => doc.id));
    const opened: OpenDocument[] = [];
    const stash: [DocId, File][] = [];
    const failed: string[] = [];

    for (const file of pdfs) {
        try {
            const doc = await openFile(file);

            // 開き直しのときだけ前回の続きに戻す。タブに残っている本は今の位置を保つ
            if (!alreadyOpen.has(doc.id)) {
                const entry = entryFor(doc);
                entry.name = doc.name;
                doc.view.page = Math.min(Math.max(entry.lastPage, 1), doc.numPages);
            }

            // openFile がバッファを worker へ transfer した後も File 自体は読める
            stash.push([doc.id, file]);
            opened.push(doc);
        } catch (error) {
            failed.push(`${file.name}: ${message(error)}`);
        }
    }

    syncTabs();

    if (opened.length === 0) {
        statusbar.error(`開けませんでした — ${failed.join(" / ")}`);
        return;
    }

    const first = opened[0];
    await activate(first);

    const resumed = first.view.page > 1 ? ` / ${first.view.page} ページから` : "";
    const elapsed = Math.round(performance.now() - started);
    const note = failed.length === 0 ? "" : ` / ${failed.length} 冊は開けなかった`;
    statusbar.info(`${first.numPages} ページ / ${elapsed}ms${resumed}${note}`);

    // 保存できなくても読めているので、待たせず後ろで流す
    void stashToLibrary(stash);
}

async function stashToLibrary(stash: readonly [DocId, File][]): Promise<void> {
    if (stash.length === 0 || !library.isSupported()) {
        return;
    }

    // ライブラリから開いた本を書き戻しても同じ中身にしかならない
    const stored = new Set((await library.list()).map((entry) => entry.id));
    const fresh = stash.filter(([id]) => !stored.has(id));
    if (fresh.length === 0) {
        return;
    }

    await library.requestPersistence();
    for (const [id, file] of fresh) {
        await library.save(id, file);
    }
    await refreshLibrary();
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
showEmptyState();
void refreshLibrary();

// 開発サーバでは登録しない。キャッシュが HMR の差し替えより先に古いモジュールを返す
if (import.meta.env.PROD && "serviceWorker" in navigator) {
    registerServiceWorker({
        onUpdateReady: () =>
            statusbar.info("新しい版を取り込みました。窓をすべて閉じて開き直すと切り替わります。"),
    }).catch((error: unknown) => {
        statusbar.error(`オフライン用の登録に失敗しました: ${message(error)}`);
    });
}
