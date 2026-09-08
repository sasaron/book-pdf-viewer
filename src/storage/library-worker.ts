export type LibraryWriteRequest = {
    request: number;
    directory: string;
    name: string;
    file: File;
};

export type LibraryWriteResponse = {
    request: number;
    ok: boolean;
    error?: string;
};

// worker 専用の API なので lib.dom には無い。使う形だけ書く
type SyncAccessHandle = {
    truncate(size: number): void;
    write(buffer: BufferSource, options?: { at?: number }): number;
    flush(): void;
    close(): void;
};

type SyncCapableFileHandle = FileSystemFileHandle & {
    createSyncAccessHandle(): Promise<SyncAccessHandle>;
};

const scope = self as unknown as {
    addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
    postMessage(message: LibraryWriteResponse): void;
};

scope.addEventListener("message", (event: MessageEvent) => {
    void write(event.data as LibraryWriteRequest);
});

async function write({ request, directory, name, file }: LibraryWriteRequest): Promise<void> {
    try {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(directory, { create: true });
        // truncate より後に読むと、書き先と同じ OPFS ファイル由来の File だったとき空を読む
        const bytes = new Uint8Array(await file.arrayBuffer());

        const handle = (await dir.getFileHandle(name, { create: true })) as SyncCapableFileHandle;

        // Safari は createWritable を持たない。同期ハンドルは worker でしか取れない
        const access = await handle.createSyncAccessHandle();
        try {
            access.truncate(0);
            access.write(bytes, { at: 0 });
            access.flush();
        } finally {
            access.close();
        }

        scope.postMessage({ request, ok: true });
    } catch (error) {
        scope.postMessage({ request, ok: false, error: String(error) });
    }
}
