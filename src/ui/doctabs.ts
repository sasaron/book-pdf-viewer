import type { DocId, OpenDocument } from "../state/types.ts";

export type DocTabsActions = {
    onSelect(id: DocId): void;
    onClose(id: DocId): void;
};

export type DocTabs = {
    render(documents: readonly OpenDocument[], activeId: DocId | null): void;
};

function createTab(opened: OpenDocument, isActive: boolean, actions: DocTabsActions): HTMLElement {
    const tab = document.createElement("div");
    tab.className = "doc-tab";

    const select = document.createElement("button");
    select.type = "button";
    select.className = "doc-tab-select";
    select.textContent = opened.name;
    select.title = `${opened.name} (${opened.numPages} ページ)`;
    select.setAttribute("aria-current", String(isActive));
    select.addEventListener("click", () => actions.onSelect(opened.id));

    const close = document.createElement("button");
    close.type = "button";
    close.className = "doc-tab-close";
    close.textContent = "×";
    close.title = `${opened.name} を閉じる`;
    close.addEventListener("click", () => actions.onClose(opened.id));

    tab.append(select, close);
    return tab;
}

export function createDocTabs(container: HTMLElement, actions: DocTabsActions): DocTabs {
    return {
        render(documents, activeId) {
            container.replaceChildren(
                ...documents.map((opened) => createTab(opened, opened.id === activeId, actions)),
            );
            container.hidden = documents.length === 0;
        },
    };
}
