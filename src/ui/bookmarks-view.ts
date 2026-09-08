import type { Bookmark } from "../state/types.ts";

export type BookmarksActions = {
    onJump(page: number): void;
    onRemove(page: number): void;
};

export type BookmarksView = {
    render(marks: readonly Bookmark[]): void;
};

function createRow(mark: Bookmark, actions: BookmarksActions): HTMLElement {
    const row = document.createElement("div");
    row.className = "bookmark";

    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "bookmark-jump";
    jump.title = `${mark.page} ページを開く`;

    const page = document.createElement("span");
    page.className = "bookmark-no";
    page.textContent = String(mark.page);

    const label = document.createElement("span");
    label.className = "bookmark-title";
    label.textContent = mark.label === "" ? `${mark.page} ページ` : mark.label;

    jump.append(page, label);
    jump.addEventListener("click", () => actions.onJump(mark.page));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "bookmark-remove";
    remove.textContent = "×";
    remove.title = "このしおりを外す";
    remove.addEventListener("click", () => actions.onRemove(mark.page));

    row.append(jump, remove);
    return row;
}

export function createBookmarksView(
    container: HTMLElement,
    heading: HTMLElement,
    actions: BookmarksActions,
): BookmarksView {
    return {
        render(marks) {
            container.replaceChildren(...marks.map((mark) => createRow(mark, actions)));
            container.hidden = marks.length === 0;
            heading.hidden = marks.length === 0;
            heading.textContent = `しおり (${marks.length})`;
        },
    };
}
