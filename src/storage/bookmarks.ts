import type { Bookmark, DocId } from "../state/types.ts";

export const BOOKMARKS_KEY = "pdfviewer:bookmarks:v1";

export type BookmarkEntry = {
    name: string;
    updatedAt: number;
    lastPage: number;
    marks: Bookmark[];
};

export type BookmarkStore = Record<DocId, BookmarkEntry>;

export function hasMark(marks: readonly Bookmark[], page: number): boolean {
    return marks.some((mark) => mark.page === page);
}

export function addMark(marks: readonly Bookmark[], page: number, label = ""): Bookmark[] {
    if (hasMark(marks, page)) {
        return [...marks];
    }
    return [...marks, { page, label }].sort((a, b) => a.page - b.page);
}

export function removeMark(marks: readonly Bookmark[], page: number): Bookmark[] {
    return marks.filter((mark) => mark.page !== page);
}

export function toggleMark(marks: readonly Bookmark[], page: number, label = ""): Bookmark[] {
    return hasMark(marks, page) ? removeMark(marks, page) : addMark(marks, page, label);
}

function parseMarks(value: unknown): Bookmark[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const marks: Bookmark[] = [];
    for (const item of value) {
        if (typeof item !== "object" || item === null) {
            continue;
        }
        const { page, label } = item as Partial<Bookmark>;
        if (typeof page !== "number" || !Number.isFinite(page) || page < 1) {
            continue;
        }
        marks.push({
            page: Math.floor(page),
            label: typeof label === "string" ? label : "",
        });
    }

    return marks.sort((a, b) => a.page - b.page);
}

function parsePage(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value >= 1
        ? Math.floor(value)
        : 1;
}

export function parseStore(raw: string | null): BookmarkStore {
    if (raw === null) {
        return {};
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return {};
    }

    const store: BookmarkStore = {};
    for (const [id, value] of Object.entries(parsed)) {
        if (typeof value !== "object" || value === null) {
            continue;
        }
        const entry = value as Partial<BookmarkEntry>;
        store[id] = {
            name: typeof entry.name === "string" ? entry.name : "",
            updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : 0,
            lastPage: parsePage(entry.lastPage),
            marks: parseMarks(entry.marks),
        };
    }

    return store;
}

export function loadStore(): BookmarkStore {
    try {
        return parseStore(localStorage.getItem(BOOKMARKS_KEY));
    } catch {
        return {};
    }
}

export function saveStore(store: BookmarkStore): void {
    try {
        localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(store));
    } catch {
        // 保存できなくても開いている間は挟める
    }
}
