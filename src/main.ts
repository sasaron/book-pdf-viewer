import { isPdf, openFile } from "./pdf/loader.ts";
import { clampScale, createRenderer, SCALE_STEP } from "./pdf/renderer.ts";
import { createStore } from "./state/store.ts";
import type { OpenDocument, ViewerState } from "./state/types.ts";
import { loadPrefs, savePrefs } from "./storage/prefs.ts";
import { required } from "./ui/dom.ts";
import { createDropzone } from "./ui/dropzone.ts";
import { createKeyboard } from "./ui/keyboard.ts";
import { createStatusbar } from "./ui/statusbar.ts";
import { createToolbar } from "./ui/toolbar.ts";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";

const viewer = required<HTMLElement>("#viewer");
const fileInput = required<HTMLInputElement>("#file");
const statusbar = createStatusbar(required<HTMLElement>("#statusbar"));
const renderer = createRenderer(viewer);

const prefs = loadPrefs();

const store = createStore<ViewerState>({
    docId: null,
    name: "",
    page: 1,
    numPages: 0,
    scale: 1,
    fit: true,
    sidebarCollapsed: prefs.sidebarCollapsed,
});

let active: OpenDocument | null = null;

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function draw(pageNumber: number): Promise<void> {
    if (active === null) {
        return;
    }
    try {
        await renderer.render(active, pageNumber);
        store.set({ page: active.view.page, scale: active.view.scale, fit: active.view.fit });
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

    onToggleSidebar: () => {
        const sidebarCollapsed = !store.get().sidebarCollapsed;
        store.set({ sidebarCollapsed });
        savePrefs({ sidebarCollapsed });
    },

    onEscape: () => statusbar.clear(),
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

    try {
        const started = performance.now();
        active = await openFile(file);
        store.set({
            docId: active.id,
            name: active.name,
            numPages: active.numPages,
            page: active.view.page,
            fit: active.view.fit,
        });
        await draw(active.view.page);
        statusbar.info(`${active.numPages} ページ / ${Math.round(performance.now() - started)}ms`);
    } catch (error) {
        active = null;
        store.set({ docId: null, name: "", numPages: 0 });
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

document.body.classList.toggle("sidebar-collapsed", prefs.sidebarCollapsed);
toolbar.update(store.get());
