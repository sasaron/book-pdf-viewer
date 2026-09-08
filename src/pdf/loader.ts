import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { DocId, OpenDocument } from "../state/types.ts";

GlobalWorkerOptions.workerSrc = workerUrl;

// worker は /assets/ 配下から取りに行くので、相対 URL のままだと /assets/wasm/ を掴んで SPA
// フォールバックの HTML が返る
function assetUrl(dir: string): string {
    return new URL(`${import.meta.env.BASE_URL}${dir}/`, document.baseURI).href;
}

export const PDF_ASSETS = {
    cMapUrl: assetUrl("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: assetUrl("standard_fonts"),
    wasmUrl: assetUrl("wasm"),
    iccUrl: assetUrl("iccs"),
    isEvalSupported: false,
} as const;

const DOC_ID_BYTES = 8;

const documents = new Map<DocId, OpenDocument>();

async function hashDocId(buffer: ArrayBuffer): Promise<DocId> {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest).slice(0, DOC_ID_BYTES))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

export async function openFile(file: File): Promise<OpenDocument> {
    const buffer = await file.arrayBuffer();

    // getDocument が buffer を worker へ transfer してデタッチするので後から digest できない
    const id = await hashDocId(buffer);

    const cached = documents.get(id);
    if (cached !== undefined) {
        return cached;
    }

    const task = getDocument({ data: new Uint8Array(buffer), ...PDF_ASSETS });
    const doc = await task.promise;
    const opened: OpenDocument = {
        id,
        name: file.name,
        numPages: doc.numPages,
        doc,
        task,
        outline: null,
        view: { page: 1, scale: 1.3, fit: true },
    };
    documents.set(id, opened);
    return opened;
}

export function openDocuments(): OpenDocument[] {
    return [...documents.values()];
}

export async function closeDocument(id: DocId): Promise<void> {
    const opened = documents.get(id);
    if (opened === undefined) {
        return;
    }

    documents.delete(id);
    // v6 で PDFDocumentProxy.destroy は消えたので loadingTask 側から畳む
    await opened.task.destroy();
}

export function isPdf(file: File): boolean {
    return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
