import type { DocId } from "../state/types.ts";
import type { LibraryEntry, LibraryUsage } from "../storage/library.ts";

export type LibraryActions = {
    onOpen(id: DocId): void;
    onRemove(id: DocId): void;
};

export type LibraryView = {
    render(entries: readonly LibraryEntry[], usage: LibraryUsage | null): void;
};

function formatBytes(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    if (mb >= 1024) {
        return `${(mb / 1024).toFixed(1)} GB`;
    }
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(Math.round(bytes / 1024), 1)} KB`;
}

function formatDate(at: number): string {
    return new Date(at).toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
    });
}

function createRow(entry: LibraryEntry, actions: LibraryActions): HTMLElement {
    const row = document.createElement("div");
    row.className = "library-item";

    const open = document.createElement("button");
    open.type = "button";
    open.className = "library-open";
    open.title = `${entry.name} を開く`;

    const name = document.createElement("span");
    name.className = "library-name";
    name.textContent = entry.name;

    const meta = document.createElement("span");
    meta.className = "library-meta";
    meta.textContent = `${formatBytes(entry.size)} · ${formatDate(entry.savedAt)}`;

    open.append(name, meta);
    open.addEventListener("click", () => actions.onOpen(entry.id));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "library-remove";
    remove.textContent = "×";
    remove.title = `${entry.name} をこの端末から消す`;
    remove.addEventListener("click", () => actions.onRemove(entry.id));

    row.append(open, remove);
    return row;
}

export function createLibraryView(container: HTMLElement, actions: LibraryActions): LibraryView {
    return {
        render(entries, usage) {
            if (entries.length === 0) {
                container.replaceChildren();
                container.hidden = true;
                return;
            }

            const used = entries.reduce((total, entry) => total + entry.size, 0);
            const room = usage === null ? "" : ` / 空き ${formatBytes(usage.quota - used)}`;

            const heading = document.createElement("div");
            heading.className = "library-head";
            heading.textContent = `最近開いた本 (${entries.length}) — ${formatBytes(used)}${room}`;

            const note = document.createElement("p");
            note.className = "library-note";
            note.textContent =
                "この端末のブラウザに置いているだけで、どこにも送っていない。" +
                "しばらく開かないとブラウザが消すことがある。";

            container.replaceChildren(
                heading,
                ...entries.map((entry) => createRow(entry, actions)),
                note,
            );
            container.hidden = false;
        },
    };
}
