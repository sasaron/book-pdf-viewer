import type { DocId } from "../state/types.ts";
import type { LibraryWriteRequest, LibraryWriteResponse } from "./library-worker.ts";

const DIRECTORY = "pdfs";
const META_KEY = "pdfviewer:library:v1";
const SUFFIX = ".pdf";

export type LibraryEntry = {
    id: DocId;
    name: string;
    size: number;
    savedAt: number;
};

export type LibraryUsage = {
    quota: number;
};

type MetaRecord = Record<DocId, { name: string; savedAt: number }>;

export function isSupported(): boolean {
    return (
        typeof navigator !== "undefined" &&
        typeof navigator.storage?.getDirectory === "function" &&
        typeof Worker === "function"
    );
}

function parseMeta(raw: string | null): MetaRecord {
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

    const meta: MetaRecord = {};
    for (const [id, value] of Object.entries(parsed)) {
        if (typeof value !== "object" || value === null) {
            continue;
        }
        const record = value as Partial<MetaRecord[string]>;
        meta[id] = {
            name: typeof record.name === "string" ? record.name : "",
            savedAt: typeof record.savedAt === "number" ? record.savedAt : 0,
        };
    }

    return meta;
}

function loadMeta(): MetaRecord {
    try {
        return parseMeta(localStorage.getItem(META_KEY));
    } catch {
        return {};
    }
}

function saveMeta(meta: MetaRecord): void {
    try {
        localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch {
        // 名前が出ないだけで実体は OPFS 側にある
    }
}

async function directory(create: boolean): Promise<FileSystemDirectoryHandle | null> {
    if (!isSupported()) {
        return null;
    }
    try {
        const root = await navigator.storage.getDirectory();
        return await root.getDirectoryHandle(DIRECTORY, { create });
    } catch {
        return null;
    }
}

/** 実体が消えても「あるはず」で進まないよう、一覧は常に OPFS 側を正とする。 */
export async function list(): Promise<LibraryEntry[]> {
    const dir = await directory(false);
    if (dir === null) {
        return [];
    }

    const meta = loadMeta();
    const entries: LibraryEntry[] = [];

    try {
        for await (const [fileName, handle] of dir.entries()) {
            if (handle.kind !== "file" || !fileName.endsWith(SUFFIX)) {
                continue;
            }
            const id = fileName.slice(0, -SUFFIX.length);
            const file = await handle.getFile();
            const record = meta[id];
            entries.push({
                id,
                name: record?.name === undefined || record.name === "" ? id : record.name,
                size: file.size,
                savedAt: record?.savedAt ?? file.lastModified,
            });
        }
    } catch {
        return [];
    }

    const alive = new Set(entries.map((entry) => entry.id));
    const stale = Object.keys(meta).filter((id) => !alive.has(id));
    if (stale.length > 0) {
        for (const id of stale) {
            delete meta[id];
        }
        saveMeta(meta);
    }

    return entries.sort((a, b) => b.savedAt - a.savedAt);
}

let worker: Worker | null = null;
let lastRequest = 0;

function writer(): Worker {
    worker ??= new Worker(new URL("./library-worker.ts", import.meta.url), { type: "module" });
    return worker;
}

export async function save(id: DocId, file: File): Promise<boolean> {
    if (!isSupported()) {
        return false;
    }

    const request = ++lastRequest;
    const target = writer();

    const ok = await new Promise<boolean>((resolve) => {
        const onMessage = (event: MessageEvent<LibraryWriteResponse>) => {
            if (event.data.request !== request) {
                return;
            }
            target.removeEventListener("message", onMessage);
            resolve(event.data.ok);
        };
        target.addEventListener("message", onMessage);
        target.postMessage({
            request,
            directory: DIRECTORY,
            name: `${id}${SUFFIX}`,
            file,
        } satisfies LibraryWriteRequest);
    });

    if (ok) {
        const meta = loadMeta();
        meta[id] = { name: file.name, savedAt: Date.now() };
        saveMeta(meta);
    }

    return ok;
}

export async function read(id: DocId): Promise<File | null> {
    const dir = await directory(false);
    if (dir === null) {
        return null;
    }

    try {
        const handle = await dir.getFileHandle(`${id}${SUFFIX}`);
        const stored = await handle.getFile();
        const name = loadMeta()[id]?.name;
        // 読み戻した File は application/octet-stream になる
        return new File([stored], name === undefined || name === "" ? `${id}${SUFFIX}` : name, {
            type: "application/pdf",
        });
    } catch {
        return null;
    }
}

export async function remove(id: DocId): Promise<void> {
    const meta = loadMeta();
    delete meta[id];
    saveMeta(meta);

    const dir = await directory(false);
    try {
        await dir?.removeEntry(`${id}${SUFFIX}`);
    } catch {
        // 既に退避されていても消したい結果は同じ
    }
}

/**
 * quota だけを取る。estimate().usage は量子化され書き込み直後は追いつかないので、
 * 使っている量は list() のファイルサイズを足して出す。
 */
export async function usage(): Promise<LibraryUsage | null> {
    if (!isSupported()) {
        return null;
    }
    try {
        const { quota } = await navigator.storage.estimate();
        return quota === undefined ? null : { quota };
    } catch {
        return null;
    }
}

/** 断られても失効しても構わない。付いていれば Safari の退避が先送りされる。 */
export async function requestPersistence(): Promise<boolean> {
    if (!isSupported()) {
        return false;
    }
    try {
        return (await navigator.storage.persisted()) || (await navigator.storage.persist());
    } catch {
        return false;
    }
}
