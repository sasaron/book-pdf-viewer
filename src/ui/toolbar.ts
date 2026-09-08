import type { ViewerState } from "../state/types.ts";
import { required } from "./dom.ts";

export type ToolbarActions = {
    onOpen(): void;
    onGoto(page: number): void;
    onStep(delta: number): void;
    onZoom(direction: number): void;
    onFit(): void;
    onToggleBookmark(): void;
    onToggleSpeech(): void;
    onToggleSidebar(): void;
};

export type Toolbar = {
    update(state: Readonly<ViewerState>): void;
};

export function createToolbar(actions: ToolbarActions): Toolbar {
    const openButton = required<HTMLButtonElement>("#open");
    const fileInput = required<HTMLInputElement>("#file");
    const prev = required<HTMLButtonElement>("#prev");
    const next = required<HTMLButtonElement>("#next");
    const pageInput = required<HTMLInputElement>("#page-input");
    const pageTotal = required<HTMLElement>("#page-total");
    const zoomOut = required<HTMLButtonElement>("#zoom-out");
    const zoomIn = required<HTMLButtonElement>("#zoom-in");
    const zoomFit = required<HTMLButtonElement>("#zoom-fit");
    const scaleLabel = required<HTMLElement>("#scale-label");
    const docName = required<HTMLElement>("#doc-name");
    const bookmarkToggle = required<HTMLButtonElement>("#bookmark-toggle");
    const speakToggle = required<HTMLButtonElement>("#speak-toggle");
    const toggleSidebar = required<HTMLButtonElement>("#toggle-sidebar");

    openButton.addEventListener("click", () => fileInput.click());
    prev.addEventListener("click", () => actions.onStep(-1));
    next.addEventListener("click", () => actions.onStep(1));
    pageInput.addEventListener("change", () => actions.onGoto(Number(pageInput.value)));
    zoomOut.addEventListener("click", () => actions.onZoom(-1));
    zoomIn.addEventListener("click", () => actions.onZoom(1));
    zoomFit.addEventListener("click", () => actions.onFit());
    bookmarkToggle.addEventListener("click", () => actions.onToggleBookmark());
    speakToggle.addEventListener("click", () => actions.onToggleSpeech());
    toggleSidebar.addEventListener("click", () => actions.onToggleSidebar());

    return {
        update(state) {
            const loaded = state.docId !== null;

            for (const button of [
                prev,
                next,
                zoomOut,
                zoomIn,
                zoomFit,
                bookmarkToggle,
                speakToggle,
            ]) {
                button.disabled = !loaded;
            }
            pageInput.disabled = !loaded;
            prev.disabled = !loaded || state.page <= 1;
            next.disabled = !loaded || state.page >= state.numPages;

            pageInput.value = String(state.page);
            pageInput.max = String(state.numPages);
            pageTotal.textContent = loaded ? `/ ${state.numPages}` : "/ -";
            scaleLabel.textContent = loaded ? `${Math.round(state.scale * 100)}%` : "";
            docName.textContent = state.name;

            zoomFit.setAttribute("aria-pressed", String(state.fit));

            bookmarkToggle.textContent = state.bookmarked ? "★" : "☆";
            bookmarkToggle.setAttribute("aria-pressed", String(state.bookmarked));
            bookmarkToggle.title = state.bookmarked
                ? "このページのしおりを外す ( b )"
                : "このページにしおりを挟む ( b )";

            speakToggle.textContent = state.speaking ? "止" : "読";
            speakToggle.setAttribute("aria-pressed", String(state.speaking));
            speakToggle.title = state.speaking
                ? "読み上げを止める ( r )"
                : "このページから読み上げる ( r )";

            toggleSidebar.setAttribute("aria-pressed", String(!state.sidebarCollapsed));
            toggleSidebar.title = state.sidebarCollapsed
                ? "サイドバーを出す ( [ )"
                : "サイドバーを折り畳む ( [ )";
        },
    };
}
